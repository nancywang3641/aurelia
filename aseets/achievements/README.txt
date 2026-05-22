成就素材 / Achievement Assets
==========================================

## 分類規則（V1.3 起改用 VN 立繪 emotion）

成就的 emotion 欄位現在直接沿用 VN 立繪 emotion，跟 VN 場景情緒同步。
AI 寫 [Achievement|emotion|名|描述] 時，emotion 從「表情清單」挑：

  Neutral, Happy, Think, Surprised, JumpScare, Annoyed, Angry,
  Sighing, Awkward, Embarrassed, Excited, Sad, Dissatisfied,
  Distressed, Confused, Tired, Craving, Pout, Laughing, Sleepy,
  Unhappy, Smirk, Amazed, Teasing, Sex

## 檔案命名規則

  {emotion}_{編號}.png

範例：
  Smirk_001.png      柴郡譏笑反應
  Sad_001.png        柴郡假裝難過
  Teasing_001.png    柴郡戲弄表情

編號用三位數，如 _001, _002, _003...

## 通用底圖

  achievements_default.png   沒對應 emotion 或檔案不存在時的 fallback

## 框圖（依大廳模式切換）

  R-001.png    🦀 柴郡卡帶外框（.mode-404）
  ticket.png   🌸 瀅瀅票根外框（預設模式）

兩種外框共用同一份成就資料，只是視覺主題不同。

## 加新貼紙的流程（兩步）

1. PNG 丟進這個資料夾，按命名規則
2. 同步更新兩個地方：
   - core/void/panels.js 的 STICKER_MANIFEST 把對應 emotion 數字 +1
   - css/void_achievement.css 加一行 [data-sticker="..."] 規則

## 舊版遺留 (V1.2 7 分類)

  Mock_001~003.png       已被替代，等改名為立繪 emotion
  Comfort_001~003.png    （現在不會被使用，會 fallback 到 default）
  Threat_001.png
  Manipulate_001~003.png
  Eerie_001~003.png      Eerie_00.png 命名漏 1，遲早改
  Cold_001~003.png
  Praise_001~002.png

Rae 會在有空時把這些 PNG 改名 / 重畫成立繪 emotion 命名。
