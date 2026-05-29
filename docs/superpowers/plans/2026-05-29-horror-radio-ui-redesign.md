# 午夜怪談電台 UI 重設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 regex-horror_start.json 的內嵌 HTML 視覺升級為設計稿風格——鐵盒/CRT/舊紙卡質感，Page1+Page2 合一，保留所有既有 JS 邏輯。

**Architecture:** 方案C混合。`hr_crt_frame.png`（CRT框）+ `hr_btn_*.png`（按鈕）保留圖片質感；三張故事卡用 `hr_card_1/2/3.png` 作 background；CRT 螢幕內容用 inline SVG。Page1+Page2 合併為 page-main（Header+CRT+檔案庫+三卡+Footer），Page3 保留為 page-dream。

**Tech Stack:** 純 HTML/CSS/SVG/JS，Google Fonts VT323+Noto Serif TC+Noto Sans TC，SillyTavern extension regex 注入

**素材路徑前綴:** `/scripts/extensions/third-party/my-tavern-extension/aseets/`

---

## Task 1: 複製素材到 aseets/

**Files:**
- Copy: `參考資料/panel/regions_1780065623447/part_005.png` → `aseets/hr_crt_frame.png`
- Copy: `參考資料/panel/regions_1780065623447/part_006.png` → `aseets/hr_btn_warning.png`
- Copy: `參考資料/panel/regions_1780065623447/part_007.png` → `aseets/hr_btn_refresh.png`
- Copy: `參考資料/panel/regions_1780065623447/part_008.png` → `aseets/hr_btn_enter.png`
- Copy: `參考資料/panel/regions_1780065623447/part_001.png` → `aseets/hr_card_1.png`
- Copy: `參考資料/panel/regions_1780065623447/part_002.png` → `aseets/hr_card_2.png`
- Copy: `參考資料/panel/regions_1780065623447/part_003.png` → `aseets/hr_card_3.png`

- [ ] **Step 1: 執行複製**

```bash
$src = "D:\SillyTavern\public\scripts\extensions\third-party\my-tavern-extension\參考資料\panel\regions_1780065623447"
$dst = "D:\SillyTavern\public\scripts\extensions\third-party\my-tavern-extension\aseets"
Copy-Item "$src\part_005.png" "$dst\hr_crt_frame.png"
Copy-Item "$src\part_006.png" "$dst\hr_btn_warning.png"
Copy-Item "$src\part_007.png" "$dst\hr_btn_refresh.png"
Copy-Item "$src\part_008.png" "$dst\hr_btn_enter.png"
Copy-Item "$src\part_001.png" "$dst\hr_card_1.png"
Copy-Item "$src\part_002.png" "$dst\hr_card_2.png"
Copy-Item "$src\part_003.png" "$dst\hr_card_3.png"
```

- [ ] **Step 2: 確認 7 個檔案存在**

```bash
Get-ChildItem "D:\SillyTavern\public\scripts\extensions\third-party\my-tavern-extension\aseets\hr_*.png" | Select-Object Name
```

Expected: 7 筆，hr_btn_enter/refresh/warning/crt_frame/card_1/2/3.png

- [ ] **Step 3: Commit**

```bash
git -C "D:\SillyTavern\public\scripts\extensions\third-party\my-tavern-extension" add aseets/hr_*.png
git -C "D:\SillyTavern\public\scripts\extensions\third-party\my-tavern-extension" commit -m "assets: 加入 CRT 框/卡片/按鈕素材圖片"
```

---

## Task 2: 建立獨立 HTML 預覽檔

在正式嵌入 JSON 前，先建立 standalone HTML 方便瀏覽器預覽。

**Files:**
- Create: `參考資料/panel/horror-radio-preview.html`

- [ ] **Step 1: 建立預覽 HTML（完整內容見 Task 3/4/5/6/7 組裝後填入）**

先建立骨架，後續 Task 再填充：

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Horror Radio Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=VT323&family=Noto+Sans+TC:wght@400;700;900&family=Noto+Serif+TC:wght@400;700;900&display=swap" rel="stylesheet">
<style>
body { margin: 0; background: #111; display: flex; justify-content: center; padding: 20px; }
/* STYLES HERE */
</style>
</head>
<body>
<div id="app-root">
<!-- HTML HERE -->
</div>
<script>
/* JS HERE */
</script>
</body>
</html>
```

注意：預覽檔的圖片路徑用相對路徑 `../../aseets/`（因為在 `參考資料/panel/` 下）。  
嵌入 JSON 時改為絕對路徑 `/scripts/extensions/third-party/my-tavern-extension/aseets/`。

---

## Task 3: CSS — 變數、基礎、Header

**Files:**
- Modify: `參考資料/panel/horror-radio-preview.html`（填入 `<style>` 區）

- [ ] **Step 1: 填入 CSS 變數 + 基礎樣式**

```css
#app-root *, #app-root *::before, #app-root *::after {
  box-sizing: border-box; margin: 0; padding: 0;
}
#app-root {
  --hr-bg:        #0a0a0e;
  --hr-bg2:       #14141a;
  --hr-crt:       #4ade80;
  --hr-crt-dim:   rgba(74,222,128,0.65);
  --hr-line:      rgba(74,222,128,0.18);
  --hr-line-soft: rgba(74,222,128,0.08);
  --hr-warn:      #dc2626;
  --hr-amber:     #fcd34d;
  --hr-paper:     #f4e8d0;
  --hr-ink:       #2a1f10;

  width: 100%; height: 520px; max-width: 480px;
  position: relative; overflow: hidden;
  background: var(--hr-bg);
  background-image: url('../../aseets/鐵盒素材.png');
  background-size: cover;
  border-radius: 4px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.75);
  font-size: 14px; color: var(--hr-crt);
  font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
}
/* 掃描線全版疊層 */
#app-root::after {
  content:''; position:absolute; inset:0; pointer-events:none; z-index:200;
  background: repeating-linear-gradient(
    to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px,
    rgba(0,0,0,0.08) 3px, rgba(0,0,0,0) 4px
  );
}
/* 頁面切換 */
#app-root .hr-page {
  position:absolute; inset:0; display:none; flex-direction:column;
  animation: hrFadeIn .25s ease;
}
#app-root .hr-page.active { display:flex; }
@keyframes hrFadeIn { from{opacity:0;} to{opacity:1;} }
@keyframes hrBlink   { 0%,100%{opacity:1;} 50%{opacity:0.15;} }
@keyframes hrSpin    { to{transform:rotate(360deg);} }
```

- [ ] **Step 2: 填入 Header CSS**

```css
/* ── HEADER ── */
#app-root .hr-header {
  flex-shrink:0; height:48px; position:relative;
  display:flex; align-items:center; padding:0 12px; gap:8px;
  background-image: url('../../aseets/鐵盒素材.png');
  background-size: cover;
  border-bottom: 1px solid var(--hr-line);
  overflow:hidden;
}
#app-root .hr-header::before {
  content:''; position:absolute; inset:0;
  background:rgba(0,0,0,0.6); pointer-events:none; z-index:0;
}
#app-root .hr-header > * { position:relative; z-index:1; }
#app-root .hr-rec-dot {
  width:8px; height:8px; border-radius:50%;
  background:var(--hr-warn); box-shadow:0 0 8px var(--hr-warn);
  animation:hrBlink 1.4s ease-in-out infinite; flex-shrink:0;
}
#app-root .hr-rec-label {
  font-family:'VT323',monospace; font-size:13px;
  color:var(--hr-warn); letter-spacing:2px;
}
#app-root .hr-header-center {
  flex:1; display:flex; flex-direction:column; align-items:center;
}
#app-root .hr-title {
  font-family:'Noto Serif TC',serif; font-size:16px; font-weight:900;
  letter-spacing:4px; color:var(--hr-amber);
  text-shadow:0 0 10px rgba(252,211,77,0.45);
}
#app-root .hr-subtitle {
  font-family:'VT323',monospace; font-size:10px;
  letter-spacing:3px; color:var(--hr-crt-dim);
}
#app-root .hr-signal-badge {
  display:flex; align-items:center; gap:5px;
}
#app-root .hr-signal-text {
  font-family:'VT323',monospace; font-size:11px;
  color:var(--hr-crt-dim); letter-spacing:1px;
}
```

- [ ] **Step 3: 驗證（瀏覽器開 preview.html）**

Header 應顯示：紅點+REC｜中文電台名+英文副標｜訊號良好+4格 bar  
背景應有鐵盒金屬紋理透出

---

## Task 4: CRT 電視框 + SVG 螢幕

**Files:**
- Modify: `參考資料/panel/horror-radio-preview.html`

- [ ] **Step 1: 填入 CRT CSS**

```css
/* ── CRT ── */
#app-root .hr-crt-section {
  flex-shrink:0; height:182px; position:relative;
  margin:4px 10px 0; flex-shrink:0;
}
#app-root .hr-crt-frame {
  position:absolute; inset:0;
  background-image:url('../../aseets/hr_crt_frame.png');
  background-size:100% 100%; background-repeat:no-repeat;
}
#app-root .hr-screen-inner {
  position:absolute;
  left:8.5%; top:9%; width:79%; height:76%;
  overflow:hidden;
}
#app-root .hr-screen-noise {
  position:absolute; inset:0; pointer-events:none;
  background-image:url('../../aseets/噪點素材.png');
  background-size:cover;
  mix-blend-mode:screen; opacity:0.18; z-index:3;
}
#app-root .hr-screen-inner::after {
  content:''; position:absolute; inset:0; pointer-events:none; z-index:4;
  background: repeating-linear-gradient(
    to bottom, transparent 0px, transparent 2px,
    rgba(0,0,0,0.12) 3px, transparent 4px
  );
}
#app-root #crt-offline {
  position:absolute; inset:0; display:flex;
  align-items:center; justify-content:center; z-index:5;
  background:rgba(0,0,0,0.7);
}
#app-root #crt-offline span {
  font-family:'VT323',monospace; font-size:32px;
  letter-spacing:8px; color:#dc2626;
  text-shadow:0 0 12px #dc2626;
  animation: hrBlink 2s ease-in-out infinite;
}
#app-root #crt-typing {
  position:absolute; inset:0; z-index:5; display:none;
  padding:8px; overflow:hidden;
  background:rgba(0,10,4,0.85);
  font-family:'VT323','Noto Sans TC',monospace;
  font-size:13px; color:#4ade80; line-height:1.65;
  text-shadow:0 0 6px rgba(74,222,128,0.6);
  white-space:pre-wrap;
}
#app-root #crt-typing::after {
  content:'▊'; animation:hrBlink .9s steps(2) infinite; color:#4ade80;
}
```

- [ ] **Step 2: 填入 CRT HTML 結構**

```html
<div class="hr-crt-section">
  <div class="hr-crt-frame"></div>
  <div class="hr-screen-inner" id="screen-inner">
    <div class="hr-screen-noise"></div>
    <svg id="crt-svg" width="100%" height="100%" viewBox="0 0 320 138"
         xmlns="http://www.w3.org/2000/svg"
         style="position:absolute;inset:0;z-index:2;">
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <!-- 頂部標籤 -->
      <text x="8" y="14" font-family="VT323,monospace" font-size="10"
            fill="rgba(74,222,128,0.7)" letter-spacing="1">頻率 FM</text>
      <text id="svg-time" x="312" y="14" font-family="VT323,monospace"
            font-size="10" fill="rgba(74,222,128,0.6)" letter-spacing="1"
            text-anchor="end">午夜時段 00:00</text>
      <!-- 99.7 大字 -->
      <text x="8" y="76" font-family="VT323,monospace" font-size="76"
            fill="#4ade80" filter="url(#glow)">99.7</text>
      <!-- 波形：16 根柱，JS 動畫 -->
      <g id="waveform" transform="translate(198,14)">
        <rect class="wb" x="0"   y="0" width="5" height="24" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="7"   y="0" width="5" height="38" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="14"  y="0" width="5" height="18" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="21"  y="0" width="5" height="42" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="28"  y="0" width="5" height="28" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="35"  y="0" width="5" height="16" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="42"  y="0" width="5" height="44" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="49"  y="0" width="5" height="30" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="56"  y="0" width="5" height="14" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="63"  y="0" width="5" height="36" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="70"  y="0" width="5" height="22" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="77"  y="0" width="5" height="32" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="84"  y="0" width="5" height="40" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="91"  y="0" width="5" height="20" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="98"  y="0" width="5" height="34" fill="#4ade80" opacity="0.75"/>
        <rect class="wb" x="105" y="0" width="5" height="18" fill="#4ade80" opacity="0.75"/>
      </g>
      <line x1="198" y1="60" x2="315" y2="60"
            stroke="rgba(74,222,128,0.25)" stroke-width="0.5"/>
      <!-- 頻率刻度尺 -->
      <g transform="translate(8,90)">
        <line x1="0" y1="8" x2="204" y2="8"
              stroke="rgba(74,222,128,0.4)" stroke-width="0.8"/>
        <!-- 刻度線 -->
        <line x1="0"   y1="4" x2="0"   y2="12" stroke="rgba(74,222,128,0.5)" stroke-width="0.8"/>
        <line x1="40"  y1="4" x2="40"  y2="12" stroke="rgba(74,222,128,0.5)" stroke-width="0.8"/>
        <line x1="80"  y1="4" x2="80"  y2="12" stroke="rgba(74,222,128,0.5)" stroke-width="0.8"/>
        <line x1="122" y1="4" x2="122" y2="12" stroke="rgba(74,222,128,0.5)" stroke-width="0.8"/>
        <line x1="162" y1="4" x2="162" y2="12" stroke="rgba(74,222,128,0.5)" stroke-width="0.8"/>
        <line x1="204" y1="4" x2="204" y2="12" stroke="rgba(74,222,128,0.5)" stroke-width="0.8"/>
        <!-- 標籤 -->
        <text x="0"   y="22" font-family="VT323,monospace" font-size="9"
              fill="rgba(74,222,128,0.6)" text-anchor="middle">88</text>
        <text x="40"  y="22" font-family="VT323,monospace" font-size="9"
              fill="rgba(74,222,128,0.6)" text-anchor="middle">92</text>
        <text x="80"  y="22" font-family="VT323,monospace" font-size="9"
              fill="rgba(74,222,128,0.6)" text-anchor="middle">96</text>
        <text x="122" y="22" font-family="VT323,monospace" font-size="9"
              fill="rgba(74,222,128,0.6)" text-anchor="middle">100</text>
        <text x="162" y="22" font-family="VT323,monospace" font-size="9"
              fill="rgba(74,222,128,0.6)" text-anchor="middle">104</text>
        <text x="204" y="22" font-family="VT323,monospace" font-size="9"
              fill="rgba(74,222,128,0.6)" text-anchor="middle">108</text>
        <!-- 99.7 指針：(99.7-88)/(108-88)*204 = 59.5 -->
        <line x1="59.5" y1="-2" x2="59.5" y2="12"
              stroke="#4ade80" stroke-width="1.5"/>
        <polygon points="59.5,-2 56,5 63,5" fill="#4ade80"/>
      </g>
      <!-- SIGNAL LOCKED -->
      <g transform="translate(8,120)">
        <rect width="110" height="16" rx="1"
              fill="rgba(74,222,128,0.08)" stroke="#4ade80" stroke-width="0.8"/>
        <text x="55" y="12" font-family="VT323,monospace" font-size="11"
              fill="#4ade80" text-anchor="middle" letter-spacing="2">SIGNAL LOCKED</text>
      </g>
      <!-- 訊號強度 -->
      <g transform="translate(190,122)">
        <text x="0" y="11" font-family="VT323,monospace" font-size="9"
              fill="rgba(74,222,128,0.6)" letter-spacing="1">訊號強度</text>
        <rect x="54" y="3" width="6" height="10" rx="0.5" fill="#4ade80"/>
        <rect x="62" y="1" width="6" height="12" rx="0.5" fill="#4ade80"/>
        <rect x="70" y="0" width="6" height="13" rx="0.5" fill="#4ade80"/>
        <rect x="78" y="0" width="6" height="13" rx="0.5" fill="#4ade80"/>
        <rect x="86" y="0" width="6" height="13" rx="0.5" fill="#4ade80"/>
        <rect x="94" y="0" width="6" height="13" rx="0.5"
              fill="rgba(74,222,128,0.15)" stroke="rgba(74,222,128,0.35)" stroke-width="0.5"/>
        <rect x="102" y="0" width="6" height="13" rx="0.5"
              fill="rgba(74,222,128,0.15)" stroke="rgba(74,222,128,0.35)" stroke-width="0.5"/>
      </g>
    </svg>
    <div class="hr-screen-noise"></div>
    <div id="crt-offline">
      <span>OFFLINE</span>
    </div>
    <div id="crt-typing"></div>
  </div>
</div>
```

- [ ] **Step 3: 驗證**

CRT 框圖片正確顯示，螢幕內可見：99.7 大字、波形柱、刻度尺、SIGNAL LOCKED、訊號強度格。OFFLINE 覆蓋在上。

---

## Task 5: 檔案庫標題 + 三張故事卡

**Files:**
- Modify: `參考資料/panel/horror-radio-preview.html`

- [ ] **Step 1: 填入檔案庫 CSS**

```css
/* ── ARCHIVE HEADER ── */
#app-root .hr-archive-header {
  flex-shrink:0; height:28px;
  display:flex; align-items:center; justify-content:space-between;
  padding:0 12px; margin-top:4px;
  background:rgba(0,0,0,0.72);
  border-top:1px solid var(--hr-line);
  border-bottom:1px solid var(--hr-line);
}
#app-root .hr-archive-left {
  display:flex; align-items:center; gap:5px;
  font-size:11px; font-weight:700; letter-spacing:2px; color:var(--hr-amber);
}
#app-root .hr-archive-right {
  display:flex; align-items:center; gap:4px;
  font-size:9px; color:var(--hr-warn); letter-spacing:1px;
}
/* ── CARDS ── */
#app-root .hr-cards-row {
  display:grid; grid-template-columns:repeat(3,1fr);
  gap:6px; padding:5px 10px;
  flex:1; min-height:0;
}
#app-root .hr-card {
  position:relative; border-radius:2px; cursor:pointer;
  background-size:100% 100%; background-repeat:no-repeat;
  transition:transform .2s, box-shadow .2s;
  overflow:hidden; display:flex; flex-direction:column;
}
#app-root #card-slot-0 { background-image:url('../../aseets/hr_card_1.png'); }
#app-root #card-slot-1 { background-image:url('../../aseets/hr_card_2.png'); }
#app-root #card-slot-2 { background-image:url('../../aseets/hr_card_3.png'); }
#app-root .hr-card:hover { transform:translateY(-2px); }
#app-root .hr-card.selected {
  box-shadow:0 0 14px rgba(220,38,38,0.75), inset 0 0 0 1px rgba(220,38,38,0.5);
}
/* photo 區 */
#app-root .hr-card-photo {
  height:68px; position:relative; overflow:hidden;
  background:linear-gradient(180deg,#060606 0%,#180a0a 100%);
}
#app-root .hr-card-photo-noise {
  position:absolute; inset:0;
  background-image:url('../../aseets/噪點素材.png');
  background-size:cover; opacity:0.35; mix-blend-mode:screen;
}
#app-root .hr-card-new-badge {
  position:absolute; top:3px; right:3px; z-index:2;
}
/* 文字區 */
#app-root .hr-card-body {
  flex:1; padding:3px 5px 3px;
  display:flex; flex-direction:column; gap:1px;
}
#app-root .hr-card-title {
  font-family:'Noto Serif TC',serif; font-size:9.5px; font-weight:900;
  color:var(--hr-ink); text-align:center; letter-spacing:0.5px;
  line-height:1.35;
}
#app-root .hr-card-meta {
  font-size:8px; color:rgba(42,31,16,0.7);
  text-align:center; font-family:'VT323',monospace;
}
#app-root .hr-card-danger {
  display:flex; align-items:center; justify-content:center; gap:3px;
  margin-top:1px;
}
#app-root .hr-card-danger-label {
  font-size:7px; color:rgba(42,31,16,0.6);
  font-family:'Noto Sans TC',sans-serif;
}
/* 空殼狀態 */
#app-root .hr-card.empty .hr-card-body { opacity:0; pointer-events:none; }
#app-root .hr-card.empty .hr-card-photo {
  background:linear-gradient(180deg,#030303 0%,#0a0404 100%);
}
#app-root .hr-card.empty .hr-card-new-badge { display:none !important; }
```

- [ ] **Step 2: 填入檔案庫 HTML**

NEW 印章 SVG helper（三張卡共用相同 SVG）：

```html
<!-- 檔案庫標題 -->
<div class="hr-archive-header">
  <div class="hr-archive-left">
    <svg width="13" height="11" viewBox="0 0 13 11">
      <rect x="0" y="3" width="13" height="8" rx="1"
            fill="none" stroke="rgba(252,211,77,0.75)" stroke-width="1"/>
      <rect x="1" y="0" width="6" height="4" rx="1"
            fill="none" stroke="rgba(252,211,77,0.75)" stroke-width="1"/>
    </svg>
    本台檔案庫
  </div>
  <div class="hr-archive-right">
    <svg width="10" height="10" viewBox="0 0 10 10">
      <polygon points="5,1 9.3,8.5 0.7,8.5"
               fill="none" stroke="#dc2626" stroke-width="1" stroke-linejoin="round"/>
      <text x="5" y="8.5" font-size="5" fill="#dc2626"
            text-anchor="middle" font-weight="bold">!</text>
    </svg>
    未經澄實‧請謹慎收聽
  </div>
</div>

<!-- 三卡 -->
<div class="hr-cards-row">
  <!-- 卡片 0 -->
  <div class="hr-card empty" id="card-slot-0" onclick="selectCard(0)">
    <div class="hr-card-photo">
      <div class="hr-card-photo-noise"></div>
      <div class="hr-card-new-badge" id="new-0">
        <svg width="30" height="20" viewBox="0 0 30 20">
          <ellipse cx="15" cy="10" rx="13" ry="8"
                   fill="rgba(220,38,38,0.1)" stroke="#dc2626" stroke-width="1.5"
                   transform="rotate(-12 15 10)"/>
          <text x="15" y="13" font-family="VT323,monospace" font-size="9"
                fill="#dc2626" text-anchor="middle"
                transform="rotate(-12 15 10)" letter-spacing="1.5">NEW</text>
        </svg>
      </div>
    </div>
    <div class="hr-card-body">
      <div class="hr-card-title" id="card-title-0"></div>
      <div class="hr-card-meta"  id="card-meta-0"></div>
      <div class="hr-card-danger">
        <span class="hr-card-danger-label">危險度</span>
        <svg id="danger-0" width="42" height="8" viewBox="0 0 42 8">
          <rect x="0"  y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="9"  y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="18" y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="27" y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="36" y="0" width="7" height="8" rx="1" class="db"/>
        </svg>
      </div>
    </div>
  </div>
  <!-- 卡片 1 -->
  <div class="hr-card empty" id="card-slot-1" onclick="selectCard(1)">
    <div class="hr-card-photo">
      <div class="hr-card-photo-noise"></div>
      <div class="hr-card-new-badge" id="new-1">
        <svg width="30" height="20" viewBox="0 0 30 20">
          <ellipse cx="15" cy="10" rx="13" ry="8"
                   fill="rgba(220,38,38,0.1)" stroke="#dc2626" stroke-width="1.5"
                   transform="rotate(-12 15 10)"/>
          <text x="15" y="13" font-family="VT323,monospace" font-size="9"
                fill="#dc2626" text-anchor="middle"
                transform="rotate(-12 15 10)" letter-spacing="1.5">NEW</text>
        </svg>
      </div>
    </div>
    <div class="hr-card-body">
      <div class="hr-card-title" id="card-title-1"></div>
      <div class="hr-card-meta"  id="card-meta-1"></div>
      <div class="hr-card-danger">
        <span class="hr-card-danger-label">危險度</span>
        <svg id="danger-1" width="42" height="8" viewBox="0 0 42 8">
          <rect x="0"  y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="9"  y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="18" y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="27" y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="36" y="0" width="7" height="8" rx="1" class="db"/>
        </svg>
      </div>
    </div>
  </div>
  <!-- 卡片 2 -->
  <div class="hr-card empty" id="card-slot-2" onclick="selectCard(2)">
    <div class="hr-card-photo">
      <div class="hr-card-photo-noise"></div>
      <div class="hr-card-new-badge" id="new-2">
        <svg width="30" height="20" viewBox="0 0 30 20">
          <ellipse cx="15" cy="10" rx="13" ry="8"
                   fill="rgba(220,38,38,0.1)" stroke="#dc2626" stroke-width="1.5"
                   transform="rotate(-12 15 10)"/>
          <text x="15" y="13" font-family="VT323,monospace" font-size="9"
                fill="#dc2626" text-anchor="middle"
                transform="rotate(-12 15 10)" letter-spacing="1.5">NEW</text>
        </svg>
      </div>
    </div>
    <div class="hr-card-body">
      <div class="hr-card-title" id="card-title-2"></div>
      <div class="hr-card-meta"  id="card-meta-2"></div>
      <div class="hr-card-danger">
        <span class="hr-card-danger-label">危險度</span>
        <svg id="danger-2" width="42" height="8" viewBox="0 0 42 8">
          <rect x="0"  y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="9"  y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="18" y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="27" y="0" width="7" height="8" rx="1" class="db"/>
          <rect x="36" y="0" width="7" height="8" rx="1" class="db"/>
        </svg>
      </div>
    </div>
  </div>
</div>
```

危險度方塊空殼 CSS（加在 style 區）：

```css
#app-root .db {
  fill: rgba(74,222,128,0.12);
  stroke: rgba(74,222,128,0.3); stroke-width: 0.5;
}
#app-root .db.on { fill: #dc2626; stroke: #dc2626; }
```

- [ ] **Step 3: 驗證**

三張卡片背景圖（舊紙張質感）正確顯示，空殼狀態下文字區隱藏。

---

## Task 6: Footer 按鈕 + page-dream 結構

**Files:**
- Modify: `參考資料/panel/horror-radio-preview.html`

- [ ] **Step 1: 填入 Footer CSS**

```css
/* ── FOOTER ── */
#app-root .hr-footer {
  flex-shrink:0; height:58px;
  display:grid; grid-template-columns:5fr 4fr 5fr;
  gap:6px; padding:5px 10px;
  background:rgba(0,0,0,0.55);
  border-top:1px solid var(--hr-line);
}
#app-root .hr-btn-img {
  border:none; padding:0; margin:0; cursor:pointer;
  background-size:100% 100%; background-repeat:no-repeat;
  border-radius:2px; position:relative; overflow:hidden;
  transition:filter .2s, transform .1s;
}
#app-root .hr-btn-img:hover:not(.hr-btn-warning):not(.disabled) {
  filter:brightness(1.18); transform:translateY(-1px);
}
#app-root .hr-btn-img:active:not(.hr-btn-warning):not(.disabled) {
  transform:translateY(0);
}
#app-root .hr-btn-warning {
  background-image:url('../../aseets/hr_btn_warning.png');
  cursor:default;
}
#app-root .hr-btn-refresh {
  background-image:url('../../aseets/hr_btn_refresh.png');
}
#app-root .hr-btn-enter {
  background-image:url('../../aseets/hr_btn_enter.png');
  transition:filter .2s, transform .1s, opacity .35s;
}
#app-root .hr-btn-enter.disabled {
  opacity:0.4; cursor:not-allowed; pointer-events:none;
}
#app-root .hr-btn-label {
  position:absolute; inset:0;
  display:flex; align-items:center; justify-content:center; gap:4px;
  font-family:'VT323',monospace; font-size:14px;
  font-weight:700; letter-spacing:2px;
  color:rgba(255,255,255,0.88);
  text-shadow:0 1px 4px rgba(0,0,0,0.9);
  pointer-events:none;
}
/* ── PAGE-DREAM ── */
#app-root #page-dream {
  background:var(--hr-bg);
  background-image:url('../../aseets/鐵盒素材.png');
  background-size:cover;
}
#app-root .hr-dream-header {
  flex-shrink:0; height:48px;
  display:flex; align-items:center; gap:10px;
  padding:0 12px; position:relative; overflow:hidden;
  background-image:url('../../aseets/鐵盒素材.png');
  background-size:cover;
  border-bottom:1px solid var(--hr-line);
}
#app-root .hr-dream-header::before {
  content:''; position:absolute; inset:0;
  background:rgba(0,0,0,0.62); pointer-events:none;
}
#app-root .hr-dream-header > * { position:relative; z-index:1; }
#app-root .hr-btn-back {
  background:none; border:1px solid transparent;
  color:var(--hr-crt-dim); font-size:20px; cursor:pointer;
  padding:4px 8px; border-radius:3px; transition:.2s; line-height:1;
}
#app-root .hr-btn-back:hover {
  color:var(--hr-crt); border-color:var(--hr-line);
  background:var(--hr-line-soft);
}
#app-root .hr-dream-title-wrap {
  flex:1; display:flex; flex-direction:column;
}
#app-root .hr-dream-sub {
  font-family:'VT323',monospace; font-size:9px;
  letter-spacing:3px; color:var(--hr-crt-dim);
}
#app-root .hr-dream-h {
  font-family:'Noto Serif TC',serif; font-size:14px;
  font-weight:900; letter-spacing:3px; color:var(--hr-crt);
}
#app-root .hr-dream-body {
  flex:1; overflow-y:auto; padding:12px;
  display:flex; flex-direction:column; gap:10px;
  scrollbar-width:thin; scrollbar-color:var(--hr-line) transparent;
}
#app-root .hr-detail-card {
  background:rgba(10,10,14,0.75);
  border:1px solid rgba(74,222,128,0.15);
  border-radius:2px; padding:10px 12px;
}
#app-root .hr-label {
  font-size:8px; font-weight:800; color:var(--hr-crt-dim);
  text-transform:uppercase; letter-spacing:2px;
  margin-bottom:4px; display:block;
  font-family:'VT323',monospace;
}
#app-root .hr-text {
  font-size:12px; color:#d4d4d8; line-height:1.7;
}
#app-root .hr-text strong { color:var(--hr-amber); }
#app-root .hr-lastwords {
  font-style:italic; color:var(--hr-warn);
  text-shadow:0 0 6px rgba(220,38,38,0.35);
  font-size:13px; line-height:1.7;
}
#app-root .hr-dream-footer {
  flex-shrink:0; height:58px;
  display:grid; grid-template-columns:1fr 2fr;
  gap:8px; padding:5px 12px;
  background:rgba(0,0,0,0.6);
  border-top:1px solid var(--hr-line);
}
/* Loading / Toast */
#app-root .hr-loading {
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:10px;
  color:var(--hr-crt-dim); font-size:11px;
  letter-spacing:3px; font-family:'VT323',monospace;
}
#app-root .hr-spinner {
  width:24px; height:24px;
  border:2px solid var(--hr-line);
  border-top-color:var(--hr-crt);
  border-radius:50%; animation:hrSpin 1s linear infinite;
}
#app-root #hr-toast {
  position:absolute; bottom:66px; left:50%;
  transform:translateX(-50%) translateY(12px);
  background:rgba(10,10,14,0.95); color:var(--hr-crt);
  border:1px solid var(--hr-crt);
  padding:7px 16px; border-radius:2px;
  font-size:11px; font-weight:700; letter-spacing:1.5px;
  pointer-events:none; opacity:0; transition:.3s;
  white-space:nowrap; z-index:999;
  box-shadow:0 0 12px rgba(74,222,128,0.3);
  font-family:'VT323',monospace;
}
#app-root #hr-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
#app-root #hr-toast.danger { color:var(--hr-warn); border-color:var(--hr-warn); }
```

- [ ] **Step 2: 填入 Footer + page-dream HTML**

```html
<!-- Footer -->
<div class="hr-footer">
  <button class="hr-btn-img hr-btn-warning" aria-label="警告"></button>
  <button class="hr-btn-img hr-btn-refresh" id="btn-refresh" onclick="startBroadcast()">
    <span class="hr-btn-label">↻ 重新收訊</span>
  </button>
  <button class="hr-btn-img hr-btn-enter disabled" id="btn-enter" onclick="enterSelected()">
    <span class="hr-btn-label">進入怪談</span>
  </button>
</div>

<!-- PAGE-DREAM -->
<div class="hr-page" id="page-dream">
  <div class="hr-dream-header">
    <button class="hr-btn-back" onclick="showPage('page-main')">‹</button>
    <div class="hr-dream-title-wrap">
      <span class="hr-dream-sub">ENTER THE DREAM</span>
      <span class="hr-dream-h" id="dream-title">入夢拯救</span>
    </div>
  </div>
  <div class="hr-dream-body" id="dream-body"></div>
  <div class="hr-dream-footer">
    <button class="hr-btn-img hr-btn-refresh" onclick="showPage('page-main')">
      <span class="hr-btn-label">‹ 返回</span>
    </button>
    <button class="hr-btn-img hr-btn-enter" id="btn-dive" onclick="diveIntoStory()">
      <span class="hr-btn-label">⚡ DIVE</span>
    </button>
  </div>
</div>

<div id="hr-toast"></div>
```

- [ ] **Step 3: 驗證**

三個 footer 按鈕有正確圖片背景，進入怪談半透明。page-dream 結構存在。

---

## Task 7: JavaScript — 全部邏輯

**Files:**
- Modify: `參考資料/panel/horror-radio-preview.html`（`<script>` 區）

- [ ] **Step 1: 填入完整 JS**

以下 JS 取代舊版全部 `<script>` 內容，保留所有原有函式（`callTavernAI`、`injectToTavern`、`writeDetailToLorebook`、`diveIntoStory`），新增 `selectCard`、`enterSelected`，改寫 `renderStories`、`startBroadcast` 廣播流程：

```js
// ================================================================
//  狀態
// ================================================================
const STATE = {
  stories: [],
  activeStory: null,
  selectedIdx: null,
  typingTimer: null
};

// ================================================================
//  工具
// ================================================================
function showPage(id) {
  document.querySelectorAll('#app-root .hr-page')
          .forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showToast(msg, danger = false) {
  const t = document.getElementById('hr-toast');
  t.textContent = msg;
  t.classList.toggle('danger', danger);
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2500);
}

function getPlayerName() {
  try { return (window.parent || window).VoidTerminal?.getUserName?.() || '聽眾'; }
  catch(e) { return '聽眾'; }
}

function tickClock() {
  const el = document.getElementById('svg-time');
  if (!el) return;
  const n = new Date();
  const hh = String(n.getHours()).padStart(2,'0');
  const mm = String(n.getMinutes()).padStart(2,'0');
  el.textContent = `午夜時段 ${hh}:${mm}`;
}

// ── CRT 打字 ──────────────────────────────────────────────
function crtOffline() {
  document.getElementById('crt-offline').style.display = 'flex';
  document.getElementById('crt-typing').style.display  = 'none';
}
function crtType(text, speed = 35, onDone = null) {
  const typing  = document.getElementById('crt-typing');
  const offline = document.getElementById('crt-offline');
  if (STATE.typingTimer) clearTimeout(STATE.typingTimer);
  offline.style.display = 'none';
  typing.style.display  = 'block';
  typing.textContent    = '';
  let i = 0;
  function tick() {
    if (i < text.length) {
      typing.textContent += text[i++];
      typing.scrollTop = typing.scrollHeight;
      STATE.typingTimer = setTimeout(tick, speed);
    } else {
      STATE.typingTimer = null;
      if (onDone) onDone();
    }
  }
  tick();
}
function crtTypePromise(text, speed = 35) {
  return new Promise(r => crtType(text, speed, r));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 波形動畫 ──────────────────────────────────────────────
function animateWaveform() {
  const bars = document.querySelectorAll('#waveform .wb');
  const maxH = 46, minH = 6;
  function tick() {
    bars.forEach(bar => {
      const h = Math.floor(Math.random() * (maxH - minH) + minH);
      bar.setAttribute('height', h);
      bar.setAttribute('y', 0);
    });
  }
  tick();
  setInterval(tick, 180);
}

// ── 選卡 ──────────────────────────────────────────────────
function selectCard(idx) {
  if (!STATE.stories[idx]) return;
  STATE.selectedIdx = idx;
  document.querySelectorAll('.hr-card')
          .forEach((c, i) => c.classList.toggle('selected', i === idx));
  const btn = document.getElementById('btn-enter');
  if (btn) { btn.classList.remove('disabled'); }
}

function enterSelected() {
  if (STATE.selectedIdx === null) return;
  openDream(STATE.selectedIdx);
  showPage('page-dream');
}

// ── 危險度方塊 ────────────────────────────────────────────
function setDanger(idx, level) {
  const svg = document.getElementById(`danger-${idx}`);
  if (!svg) return;
  svg.querySelectorAll('.db').forEach((r, i) => {
    r.classList.toggle('on', i < level);
  });
}

// ── renderStories（新版：填入三個固定卡槽）─────────────────
function renderStories() {
  STATE.stories.forEach((s, i) => {
    const slot = document.getElementById(`card-slot-${i}`);
    if (!slot) return;
    slot.classList.remove('empty');
    document.getElementById(`card-title-${i}`).textContent = s.title;
    document.getElementById(`card-meta-${i}`).textContent =
      `${s.gender}｜${s.age}歲｜${s.background}`;
    // 危險度：根據 source 關鍵字算 1-5
    const level = dangerLevel(s.source);
    setDanger(i, level);
    // NEW badge
    const nb = document.getElementById(`new-${i}`);
    if (nb) nb.style.display = '';
  });
}

function dangerLevel(source) {
  // 根據恐怖來源關鍵字給 1-5 危險度，預設 3
  const high = ['亡靈','厲鬼','詛咒','血','屍','死'];
  const low  = ['幻覺','心理','執念','回憶'];
  if (high.some(k => source.includes(k))) return 5;
  if (low.some(k => source.includes(k)))  return 2;
  return 3;
}

// ================================================================
//  PAGE-MAIN: 開始廣播
// ================================================================
async function startBroadcast() {
  const btn = document.getElementById('btn-refresh');
  if (btn) { btn.style.pointerEvents = 'none'; }
  // 重置卡片狀態
  STATE.selectedIdx = null;
  STATE.stories = [];
  [0,1,2].forEach(i => {
    const slot = document.getElementById(`card-slot-${i}`);
    if (slot) slot.classList.add('empty', ''); slot?.classList.remove('selected');
    const nb = document.getElementById(`new-${i}`);
    if (nb) nb.style.display = 'none';
    const titleEl = document.getElementById(`card-title-${i}`);
    if (titleEl) titleEl.textContent = '';
    const metaEl = document.getElementById(`card-meta-${i}`);
    if (metaEl) metaEl.textContent = '';
    setDanger(i, 0);
  });
  const enterBtn = document.getElementById('btn-enter');
  if (enterBtn) enterBtn.classList.add('disabled');

  const playerName = getPlayerName();
  await crtTypePromise('……訊號連線中……', 60);
  await sleep(500);

  const prompt = `[System] 你是「午夜詭談·歸路電台」副本的看守 AI「夜鴉」，深夜時段的低語人聲。
今晚要對唯一的聽眾——名叫「${playerName}」的人——說三個小故事。
這三個故事的主角都已經迎來了壞結局。說完後，你會點名${playerName}，請他從桌上的三張拍立得選一個故事入夢，把那位主角從結局裡帶回來。

【題材】中式恐怖。核心是情感糾葛＋因果業報＋儀式邏輯，不是西式怪物對抗。
【時代】完全開放。古代各朝代、民國、1950-1990 各年代、當代都可以。你自己根據故事內容選最契合的時代，不要偏好任何一個時代。
【三個故事的時代彼此盡量錯開，題材彼此不重複，恐怖來源類型彼此不同。】

【禁忌】
- 不寫西式恐怖元素。
- 不寫血腥獵奇直白描寫。
- 不寫過度色情。
- 恐怖感從情感壓迫、儀式邏輯、留白暗示來，不從血腥畫面或跳嚇。

【說書語氣】
陰冷、緩慢、停頓多。用「……」斷句。偶爾穿插「你說呢？」「猜猜後來怎麼了？」這種反問。
每段故事敘述要完整：環境鋪墊 → 主角遭遇了什麼 → 怎麼結束的 → 主播的一句嘆息。

嚴格按以下順序與格式輸出，不要任何前綴、解說或其他文字：

[Host|主播開場詞，告訴聽眾今晚是怎樣的夜、會說三個什麼樣的故事（80-120字，用「……」斷句）]
[Tale|第一個故事的完整敘述（130-170字，說書語氣，包含鋪墊/遭遇/結局/嘆息）]
[Tale|第二個故事的完整敘述（130-170字，同上）]
[Tale|第三個故事的完整敘述（130-170字，同上）]
[Call|主播點名${playerName}的結語，告訴他桌上有三張拍立得，要他選一個故事入夢拯救（60-100字，要直呼${playerName}的名字）]
[Horror|故事1的ID|故事標題(8字內)|主角性別|主角年齡(整數)|主角身分背景(15字內)|事件描述(30字內)|恐怖來源(10字內)|壞結局描述(25字內)|主角遺言(20字內)]
[Horror|故事2 同上格式]
[Horror|故事3 同上格式]

注意：三段 [Tale] 必須與三條 [Horror] 一一對應同樣的順序、同樣的故事。`;

  const res = await callTavernAI(prompt);
  if (!res) {
    document.getElementById('crt-typing').textContent = 'SIGNAL LOST · 訊號中斷';
    if (btn) btn.style.pointerEvents = '';
    return showToast('訊號中斷', true);
  }

  const hostText = (/\[Host\|([^\]]+)\]/.exec(res)?.[1] || '').trim()
    || '……聽得到嗎？今晚有三個故事。';
  const tales = [...res.matchAll(/\[Tale\|([^\]]+)\]/g)].map(m => m[1].trim());
  const callText = (/\[Call\|([^\]]+)\]/.exec(res)?.[1] || '').trim()
    || `${playerName}……挑一個吧。`;

  const regex = /\[Horror\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/g;
  let m;
  while ((m = regex.exec(res)) !== null) {
    STATE.stories.push({
      id: m[1].trim(), title: m[2].trim(), gender: m[3].trim(),
      age: parseInt(m[4]) || 25, background: m[5].trim(),
      event: m[6].trim(), source: m[7].trim(),
      badEnd: m[8].trim(), lastWords: m[9].trim(),
      fullTale: tales[STATE.stories.length] || ''
    });
  }
  if (!STATE.stories.length) {
    document.getElementById('crt-typing').textContent = 'PARSE ERROR';
    if (btn) btn.style.pointerEvents = '';
    return showToast('解析失敗', true);
  }

  // 廣播：開場 → 三個故事 → 點名
  await crtTypePromise(hostText, 42);
  await sleep(1200);
  for (let i = 0; i < Math.min(tales.length, 3); i++) {
    const headline = STATE.stories[i] ? `《${STATE.stories[i].title}》\n\n` : '';
    await crtTypePromise(headline + tales[i], 38);
    await sleep(1500);
  }
  await crtTypePromise(callText, 45);
  await sleep(1800);

  // 填入卡片
  renderStories();
  if (btn) btn.style.pointerEvents = '';
}

// ================================================================
//  PAGE-DREAM: 開啟故事詳情
// ================================================================
function openDream(idx) {
  const s = STATE.stories[idx];
  if (!s) return;
  STATE.activeStory = s;
  document.getElementById('dream-title').textContent = s.title;
  document.getElementById('dream-body').innerHTML = `
    <div class="hr-detail-card">
      <span class="hr-label">PROTAGONIST · 主角</span>
      <div class="hr-text"><strong>${s.gender}・${s.age}歲</strong>　${s.background}</div>
    </div>
    <div class="hr-detail-card">
      <span class="hr-label">EVENT · 事件</span>
      <div class="hr-text">${s.event}</div>
    </div>
    <div class="hr-detail-card">
      <span class="hr-label">SOURCE · 恐怖來源</span>
      <div class="hr-text"><strong>${s.source}</strong></div>
    </div>
    <div class="hr-detail-card">
      <span class="hr-label">BAD END · 已發生的結局</span>
      <div class="hr-text">${s.badEnd}</div>
    </div>
    <div class="hr-detail-card">
      <span class="hr-label">LAST WORDS · 主角遺言</span>
      <div class="hr-lastwords">「${s.lastWords}」</div>
    </div>`;
}

// ================================================================
//  callTavernAI / injectToTavern / writeDetailToLorebook / diveIntoStory
//  ── 與原版完全相同，直接保留 ──
// ================================================================
async function callTavernAI(prompt) {
  try {
    const fn = window.generateRaw || window.parent?.generateRaw;
    if (!fn) throw new Error('generateRaw 不可用');
    const res = await fn({
      user_input: ' ',
      ordered_prompts: ['world_info','chat_history',{role:'system',content:prompt}],
      quiet: true,
      stop: ['User:','\n\n\n']
    });
    return typeof res === 'string' ? res : (res?.message || '');
  } catch(e) { console.error('[HORROR_RADIO] AI 呼叫失敗:',e); return null; }
}

function injectToTavern(txt, autoSend = true) {
  try {
    const TH = window.TavernHelper || window.parent?.TavernHelper;
    if (TH && typeof TH.createChatMessages === 'function') {
      TH.createChatMessages([{role:'user',name:'System',message:txt}],{refresh:'affected'});
      return true;
    }
    const box = window.parent?.document?.getElementById('send_textarea');
    if (box) {
      box.value = txt;
      box.dispatchEvent(new Event('input',{bubbles:true}));
      box.focus();
      if (autoSend) setTimeout(() => {
        const btn = window.parent?.document?.getElementById('send_but');
        if (btn) btn.click();
      }, 200);
      return true;
    }
    throw new Error('找不到酒館輸入框');
  } catch(e) {
    console.error('[HORROR_RADIO] 注入失敗:',e);
    showToast('❌ 無法連接酒館',true);
    return false;
  }
}

async function writeDetailToLorebook(story, detail) {
  try {
    const helper = window.TavernHelper || window.parent?.TavernHelper;
    if (!helper) return null;
    let bookName = null;
    if (typeof helper.getOrCreateChatWorldbook === 'function')
      bookName = await helper.getOrCreateChatWorldbook('current');
    else if (typeof helper.getOrCreateChatLorebook === 'function')
      bookName = await helper.getOrCreateChatLorebook();
    if (!bookName) return null;
    const entryName = `入夢檔案-${story.title}`;
    const keys = [story.title, story.id,'入夢','入夢者','入夢檔案'];
    const content =
`【午夜詭談·歸路電台 · 入夢檔案 · 《${story.title}》】
⚠️ 此檔案僅供敘事 AI 參閱。
━━━ 主播說書版 ━━━\n${story.fullTale||'（無）'}
━━━ 結構化資料 ━━━
標題：《${story.title}》  主角：${story.gender}，${story.age}歲，${story.background}
事件：${story.event}  恐怖來源：${story.source}
壞結局：${story.badEnd}  遺言：「${story.lastWords}」
━━━ 詳細劇本 ━━━\n${detail}`;
    if (typeof helper.createWorldbookEntries === 'function') {
      await helper.createWorldbookEntries(bookName,[{
        name:entryName, enabled:true,
        strategy:{type:'constant',keys}, content,
        comment:`horror-radio·${story.id}`
      }]);
      return bookName;
    }
    if (typeof helper.createLorebookEntries === 'function') {
      await helper.createLorebookEntries(bookName,[{
        comment:entryName, enabled:true, type:'constant', keys, content
      }]);
      return bookName;
    }
    return null;
  } catch(e) { console.error('[HORROR_RADIO] 世界書失敗:',e); return null; }
}

async function diveIntoStory() {
  const s = STATE.activeStory;
  if (!s) return showToast('沒有選中的故事',true);
  const diveBtn = document.getElementById('btn-dive');
  if (diveBtn) { diveBtn.style.pointerEvents='none'; }
  const playerName = getPlayerName();
  showToast('劇本撰寫中...');
  const detailPrompt = `[System] 你是「午夜詭談·歸路電台」副本的劇本撰寫 AI。
聽眾「${playerName}」剛選擇入夢拯救這個故事，請撰寫完整「敘事真相書」。
主播說書版：《${s.title}》\n${s.fullTale||''}
主角：${s.gender}，${s.age}歲，${s.background}  事件：${s.event}
恐怖來源：${s.source}  壞結局：${s.badEnd}  遺言：${s.lastWords}
【撰寫要求】完整角色群（3+人物）、人物關係、恐怖真相、壞結局原由、時間線（3-5節點）、兩個伏筆（位置/表面/真相）、拯救節點（時機/方法/理由）。
中式恐怖核心：情感糾葛＋因果業報＋儀式邏輯。直接輸出劇本，分段用小標，無前綴。`;
  const detail = await callTavernAI(detailPrompt);
  if (!detail) {
    if (diveBtn) diveBtn.style.pointerEvents='';
    return showToast('劇本生成失敗',true);
  }
  showToast('劇本寫入世界書...');
  const bookName = await writeDetailToLorebook(s, detail);
  if (!bookName) {
    if (diveBtn) diveBtn.style.pointerEvents='';
    return showToast('世界書寫入失敗',true);
  }
  const trigger =
`📻【午夜詭談·歸路電台 · 入夢訊號】
故事：《${s.title}》  入夢者：${playerName}
━━━ 主播說書版 ━━━\n${s.fullTale||''}
━━━━━━━━━━━━━━━━━━━━━
${playerName} 戴上頸環，意識被收音機螢幕吸入……廣播聲漸漸遠去……
【指令】當前聊天綁定世界書有「入夢檔案-${s.title}」，以此為敘事基底，從${playerName}意識墜入夢境的瞬間展開故事。不要重述世界書資料，不劇透伏筆，直接開始敘事。`;
  const ok = injectToTavern(trigger, true);
  if (diveBtn) diveBtn.style.pointerEvents='';
  if (ok) showToast(`⚡ 已入夢《${s.title}》`);
}

// ================================================================
//  初始化
// ================================================================
window.addEventListener('load', () => {
  crtOffline();
  tickClock();
  setInterval(tickClock, 30000);
  animateWaveform();
});
```

- [ ] **Step 2: 驗證（瀏覽器）**

1. 初始：CRT 顯示 OFFLINE，三卡空殼，進入怪談半透明
2. 手動呼叫 `STATE.stories = [{title:'測試',gender:'女',age:20,background:'學生',source:'亡靈',event:'test',badEnd:'test',lastWords:'test',fullTale:''}]; renderStories()`
3. 預期：三卡填入資料，NEW 印章出現，危險度格高亮
4. 點卡片：紅色外發光，進入怪談按鈕變亮
5. 波形柱動畫運作

---

## Task 8: 嵌入 JSON regex 檔

**Files:**
- Modify: `參考資料/panel/regex-horror_start.json`

- [ ] **Step 1: 確認預覽版一切正常後，調整圖片路徑**

把所有 `../../aseets/` 換成 `/scripts/extensions/third-party/my-tavern-extension/aseets/`

```bash
# 在 horror-radio-preview.html 中確認沒有剩餘相對路徑
(Get-Content "D:\SillyTavern\public\scripts\extensions\third-party\my-tavern-extension\參考資料\panel\horror-radio-preview.html") -match "../../aseets"
# 預期：無輸出（全部已替換）
```

- [ ] **Step 2: 建立 JSON 更新腳本**

用 PowerShell 讀取 HTML，包成 JSON replaceString：

```powershell
$html   = Get-Content "...horror-radio-preview.html" -Raw -Encoding UTF8
$json   = Get-Content "...regex-horror_start.json"   -Raw -Encoding UTF8 | ConvertFrom-Json
$wrapped = "``````\n" + $html + "\n``````"
$json.replaceString = $wrapped
$json | ConvertTo-Json -Depth 10 | Set-Content "...regex-horror_start.json" -Encoding UTF8
```

- [ ] **Step 3: 驗證 JSON**

```powershell
$j = Get-Content "...regex-horror_start.json" -Raw | ConvertFrom-Json
$j.scriptName   # 應為 "Horror_START"
$j.replaceString.Length  # 應 > 10000
```

- [ ] **Step 4: Commit**

```bash
git add 參考資料/panel/regex-horror_start.json
git commit -m "feat: 午夜怪談電台 UI 全面升級（方案C混合+合併佈局）"
```

---

## 自審結果

| 規格章節 | 對應 Task |
|---------|----------|
| 素材搬移 | Task 1 ✅ |
| Header（48px、REC、信號格）| Task 3 ✅ |
| CRT 框 + SVG 內容 | Task 4 ✅ |
| 檔案庫標題條 | Task 5 ✅ |
| 三張故事卡（底圖/空殼/選中）| Task 5 ✅ |
| 危險度方塊 | Task 5+7 ✅ |
| NEW 印章 | Task 5 ✅ |
| Footer 三按鈕 | Task 6 ✅ |
| page-dream 翻新 | Task 6 ✅ |
| selectCard/enterSelected | Task 7 ✅ |
| renderStories 改寫 | Task 7 ✅ |
| 波形動畫 | Task 7 ✅ |
| 嵌入 JSON | Task 8 ✅ |
