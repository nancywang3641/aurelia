// ----------------------------------------------------------------
// [檔案] core/void/lobby_stage.js (V1.1 - 書咖俯視像素舞台+擺設模式)
// 職責：把 lobby-left 換成星露谷式俯視舞台（分層地圖/小人/NPC/互動）。
//       對話仍走 void_terminal 的 sendIrisMessage（本模組只提供 talkTarget 與各 NPC 歷史）。
// 分層：底圖(z0) → 物件與角色同一套「底邊y=z-index」深度排序（人走到桌後被遮）。
// 擺設模式：舞台右下 🖊 鈕 → 拖物件/站位、調佔地 → 本機即時生效(localStorage) + 一鍵複製數據（實作拆在 lobby_editor.js）。
// 開關：localStorage lobby_stage_on（'0' 關 → 完整還原原立繪大廳）
// ----------------------------------------------------------------
(function () {
    'use strict';

    const CDN = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/';
    const ASSET = {
        // 底圖per場景（SCENES[].base）；素材改版一律換新檔名(瀏覽器對舊檔快取7天,原地覆蓋沒用)
        ying:  CDN + 'lobby_ying_v2.png',    // 瀅瀅立繪(v2=Rae修圖;改版必換檔名防快取)
        alice: CDN + 'lobby_alice_v2.png',   // 愛麗絲立繪(v2)
        cheshire: CDN + 'lobby_cheshire.png',
        mcF:   CDN + 'lobby_mc_f_silhouette.png',   // 通用小人預設=剪影版(Rae定案 2026-07-15)；換裝在裝扮室
        mcM:   CDN + 'lobby_mc_m_silhouette.png',
        walkBase: CDN + 'lobby_walk_base_v1.png',   // 3×4走路圖素體(列=下/左/右/上,欄=左步/立/右步)
        yingWalk: CDN + 'lobby_ying_walk_v2.png',       // 瀅瀅豆豆走路圖(v2=Rae修圖)
        aliceWalk: CDN + 'lobby_alice_walk_v2.png',     // 愛麗絲走路圖(v2)
        cheshireWalk: CDN + 'lobby_cheshire_walk_v2.png', // 柴郡走路圖(v2=Rae調過大小；改版必換檔名防快取)
        rayWalk:  CDN + 'lobby_ray_walk_v1.png',   // 雷伊走路圖(SN自發登場)
        danWalk:  CDN + 'lobby_dan_walk_v2.png',   // 丹走路圖(v2=Rae修圖)
        ray:      CDN + 'lobby_ray.png',           // 雷伊對話立繪
        dan:      CDN + 'lobby_dan.png',           // 丹對話立繪
        rabbitWalk: CDN + 'lobby_rabbit_walk_v1.png',   // 白兔先生走路圖(3×4；交易所店員)
        rabbit: CDN + 'lobby_rabbit_portrait_v1.png',   // 白兔先生對話立繪
    };
    const MAP_W = 1536, MAP_H = 1024;   // 底圖尺寸（兩場景同規格）

    // ── 🗺️ 場景註冊表（雙子設定：瀅瀅書咖 ⇄ 愛麗絲純白大廳）──
    // layout: footH=腳印高(物件底部佔地)、s=個別縮放；points: 各場景擺設模式各存各的
    // doors: 走進觸發區→白光過場→切場景（spawn=抵達點）
    const SCENES = {
        cafe: {
            base: 'lobby_base_v2.png',
            mask: 'lobby_mask_cafe_v1.png',   // Rae 手繪碰撞遮罩(白=可走)；載入後取代鋼索+烤死家具矩形
            cfgKey: 'lobby_stage_layout_v1',   // 沿用 Rae 已調好的存檔
            layout: [
                { file: 'lobby_obj_counter.png', x: 292,  y: 376, w: 1266, h: 396, footH: 150, s: 0.4 },
                { file: 'lobby_obj_02.png',      x: 337,  y: 570, w: 394,  h: 258, footH: 90,  s: 0.6 },
                { file: 'lobby_obj_01.png',      x: 701,  y: 685, w: 391,  h: 267, footH: 90,  s: 0.6 },
                { file: 'lobby_obj_04.png',      x: 955,  y: 524, w: 396,  h: 263, footH: 90,  s: 0.6 },
                { file: 'lobby_obj_03.png',      x: 1054, y: 217, w: 166,  h: 259, footH: 60,  s: 0.55 },
                { file: 'lobby_obj_05.png',      x: 1413, y: 612, w: 156,  h: 259, footH: 60,  s: 0.59 },
                { file: 'lobby_obj_07.png',      x: 101,  y: 829, w: 425,  h: 177, footH: 20,  s: 0.7 },
            ],
            points: {
                yingZone: { x: 315, y: 438, w: 465, h: 30 },
                npcZone:  { x: 184, y: 542, w: 1109, h: 248 },   // 客人出沒區（輪班NPC隨機刷在框內）
                player: { x: 697, y: 600 },
                arrive: { x: 780, y: 868 },   // 走門進來的落點（從街區進書咖：底部大門前）
                // 外框鋼索：可走範圍多邊形（牆角錨點可在擺設模式拖）
                boundary: [
                    { x: 195, y: 360 }, { x: 1453, y: 315 }, { x: 1517, y: 642 },
                    { x: 1529, y: 923 }, { x: 75, y: 925 }, { x: 105, y: 640 },
                ],
                actorScale: 0.7,
            },
            walls: [
                // 外牆改走 boundary 鋼索；這裡只留底圖烤死的家具
                { x: 1140, y: 360, w: 260,  h: 155 },   // 右側沙發閱讀角
                { x: 1140, y: 800, w: 396,  h: 130 },   // 右下露臺花圃
                { x: 915,  y: 840, w: 180,  h: 90 },    // 底部中央花圃
                { x: 55,   y: 620, w: 130,  h: 110 },   // 左側小案几
            ],
            // 書咖⇄大廳不再直通（2026-07-17 Rae 定案）：出入口只剩底部大門→城市街區；doorsV 擋舊存檔的門座標
            doors: [ { x: 700, y: 895, w: 160, h: 40, to: 'city', spawn: { x: 384, y: 400 } } ],  // 底部大門→街區（落在書咖建築門口）
            doorsV: 2,
        },
        hall: {
            base: 'lobby_hall_base_v6.png',   // v6=Rae 修正底圖(exchange_left_entry02)
            mask: 'lobby_hall_mask_v5.png',   // v5 手繪碰撞遮罩(白=可走)
            cfgKey: 'lobby_stage_layout_hall_v9',   // v9：定版 Rae 擺設數據（兩組座位左+右）
            layout: [   // ⬇ Rae 擺設模式輸出（複製數據）；改版請直接換這份
                { file: "lobby_hall_obj_counter_v5.png", x: 994, y: 229, w: 1548, h: 556, footH: 160, footW: 1548, s: 0.27 },
                { file: "lobby_hall_obj_pedestal_v5.png", x: 630, y: 462, w: 989, h: 682, footH: 120, footW: 360, s: 0.275, layer: "floor", noCollide: true },
                { file: "lobby_hall_obj_core_v5.png", x: 657, y: 252, w: 245, h: 321, footH: 40, footW: 86, s: 0.902, float: true },
                { file: "lobby_hall_obj_sofa_v6.png", x: 108, y: 231, w: 1012, h: 844, footH: 570, footW: 798, s: 0.248 },
                { file: "lobby_hall_obj_coffee_v6.png", x: 260, y: 309, w: 754, h: 593, footH: 360, footW: 754, s: 0.173 },
                { file: "lobby_hall_obj_lounge_v6.png", x: 382, y: 234, w: 544, h: 752, footH: 295, footW: 485, s: 0.132 },
                { file: "lobby_hall_obj_holotable_v5.png", x: 298, y: 679, w: 625, h: 569, footH: 200, footW: 369, s: 0.138 },
                { file: "lobby_hall_obj_chair_nw_v5.png", x: 215, y: 631, w: 619, h: 837, footH: 310, footW: 557, s: 0.125 },
                { file: "lobby_hall_obj_chair_ne_v5.png", x: 390, y: 631, w: 668, h: 880, footH: 310, footW: 601, s: 0.125 },
                { file: "lobby_hall_obj_chair_s_v5.png", x: 307, y: 736, w: 414, h: 429, footH: 190, footW: 373, s: 0.178 },
                { file: "lobby_hall_obj_deco_05_v5.png", x: 540, y: 116, w: 132, h: 139, footH: 60, footW: 118, s: 1.169 },
                { file: "lobby_hall_obj_deco_01_v5.png", x: 985, y: 795, w: 67, h: 124, footH: 40, footW: 59, s: 0.799 },
                { file: "lobby_hall_obj_deco_02_v5.png", x: 1420, y: 300, w: 63, h: 99, footH: 20, s: 0.6 },
                { file: "lobby_hall_obj_chair_nw_v5.png", x: 1192, y: 537, w: 619, h: 837, footH: 310, footW: 557, s: 0.125 },
                { file: "lobby_hall_obj_holotable_v5.png", x: 1275, y: 585, w: 625, h: 569, footH: 200, footW: 369, s: 0.138 },
                { file: "lobby_hall_obj_chair_s_v5.png", x: 1284, y: 642, w: 414, h: 429, footH: 190, footW: 373, s: 0.178 },
                { file: "lobby_hall_obj_chair_ne_v5.png", x: 1367, y: 537, w: 668, h: 880, footH: 310, footW: 601, s: 0.125 },
                { file: "lobby_hall_obj_deco_05_v5.png", x: 842, y: 114, w: 132, h: 139, footH: 60, footW: 118, s: 1.169 },
            ],
            points: {
                npcZone:  { x: 191, y: 249, w: 1273, h: 626 },
                player: { x: 760, y: 640 },
                arrive: { x: 730, y: 820 },   // 從街區底部大門進來的落點
                alicePos: { x: 1072, y: 331 },   // 愛麗絲站位（可在擺設模式拖）
                boundary: [
                    { x: 190, y: 235 }, { x: 1400, y: 235 }, { x: 1465, y: 880 }, { x: 85, y: 880 },
                ],
                actorScale: 0.7,
            },
            walls: [],   // 碰撞全走手繪遮罩
            doors: [
                { x: 577, y: 888, w: 385, h: 110, to: 'city', spawn: { x: 1205, y: 655 } },   // 底部大門→街區
                { x: 65, y: 490, w: 58, h: 203, to: 'exchange', spawn: { x: 1330, y: 620 } },   // 左拱門→交易所（落在交易所右側）
            ],
            doorsV: 3,
            alice: { x: 1072, y: 331 },   // 愛麗絲：不漫步、正面站
        },
        room404: {   // 🐈‍⬛ 柴郡的地下駭客車庫（ERR_404 進、SYS_RESTORE 或走底部出口回）
            base: 'lobby_404_base_v1.png',
            mask: 'lobby_404_mask_v1.png',
            cfgKey: 'lobby_stage_layout_404_v1',
            layout: [
                // 圓桌(筆電)：疊在底圖同位置做深度遮擋，人繞到桌後會被擋住
                { file: 'lobby_404_obj_table.png', x: 468, y: 500, w: 243, h: 239, footH: 120, footW: 200, s: 0.72 },
            ],
            points: {
                player: { x: 760, y: 760 },
                arrive: { x: 600, y: 820 },
                cheshirePos: { x: 900, y: 620 },   // 柴郡站位（可在擺設模式拖）
                boundary: [ { x: 176, y: 470 }, { x: 1390, y: 470 }, { x: 1390, y: 930 }, { x: 176, y: 930 } ],  // 遮罩沒載時的粗略退路
                actorScale: 0.7,
            },
            walls: [],
            doors: [ { x: 520, y: 850, w: 180, h: 60, to: 'cafe', restore: true } ],  // 底部出口=走出404(觸發系統還原流程)
            cheshire: { x: 900, y: 620 },   // 柴郡：癱在螢幕牆前，懶得動
        },
        exchange: {   // 🏦 交易所：純白大廳左門進的一間房；白兔先生站櫃台，點他開買房面板（家具粗擺，擺設模式可拖）
            base: 'lobby_exchange_base_v2.png',   // v2=Rae 修正版（換檔名防快取）
            mask: 'lobby_exchange_mask_v1.png',
            cfgKey: 'lobby_stage_layout_exchange_v2',   // v2：定版 Rae 擺設數據（兩組洽談區）
            layout: [   // ⬇ Rae 擺設模式輸出（複製數據）；改版請直接換這份
                { file: "lobby_exchange_obj_rate_screen.png", x: 524, y: 37, w: 1682, h: 507, footH: 0, s: 0.3, layer: "back" },
                { file: "lobby_exchange_obj_counter.png", x: 366, y: 232, w: 1949, h: 448, footH: 90, footW: 1929, s: 0.411 },
                { file: "lobby_exchange_obj_rug.png", x: 258, y: 593, w: 1150, h: 777, footH: 0, s: 0.3, layer: "floor", noCollide: true },
                { file: "lobby_exchange_obj_lamp_left.png", x: 299, y: 524, w: 212, h: 678, footH: 170, s: 0.132 },
                { file: "lobby_exchange_obj_table.png", x: 388, y: 632, w: 651, h: 769, footH: 320, footW: 422, s: 0.136 },
                { file: "lobby_exchange_obj_chair_left.png", x: 315, y: 597, w: 603, h: 766, footH: 370, s: 0.129 },
                { file: "lobby_exchange_obj_chair_right.png", x: 472, y: 599, w: 606, h: 801, footH: 410, s: 0.129 },
                { file: "lobby_exchange_obj_chair_front_v2.png", x: 394, y: 715, w: 491, h: 471, footH: 240, s: 0.156 },
                { file: "lobby_exchange_obj_bench.png", x: 192, y: 355, w: 978, h: 613, footH: 60, s: 0.132 },
                { file: "lobby_exchange_obj_plant.png", x: 148, y: 348, w: 485, h: 1227, footH: 40, s: 0.07 },
                { file: "lobby_exchange_obj_planter.png", x: 269, y: 710, w: 352, h: 822, footH: 200, footW: 317, s: 0.122 },
                { file: "lobby_exchange_obj_lamp_left.png", x: 544, y: 525, w: 212, h: 678, footH: 170, s: 0.132 },
                { file: "lobby_exchange_obj_planter.png", x: 1268, y: 722, w: 352, h: 822, footH: 200, footW: 317, s: 0.122 },
                { file: "lobby_exchange_obj_rug.png", x: 967, y: 600, w: 1150, h: 777, footH: 0, s: 0.3, layer: "floor", noCollide: true },
                { file: "lobby_exchange_obj_chair_left.png", x: 1024, y: 604, w: 603, h: 766, footH: 370, s: 0.129 },
                { file: "lobby_exchange_obj_chair_right.png", x: 1181, y: 606, w: 606, h: 801, footH: 410, s: 0.129 },
                { file: "lobby_exchange_obj_table.png", x: 1097, y: 639, w: 651, h: 769, footH: 320, footW: 422, s: 0.136 },
                { file: "lobby_exchange_obj_chair_front_v2.png", x: 1103, y: 722, w: 491, h: 471, footH: 230, s: 0.156 },
                { file: "lobby_exchange_obj_lamp_left.png", x: 1008, y: 531, w: 212, h: 678, footH: 170, s: 0.132 },
                { file: "lobby_exchange_obj_lamp_left.png", x: 1253, y: 532, w: 212, h: 678, footH: 170, s: 0.132 },
            ],
            points: {
                npcZone:  { x: 118, y: 418, w: 1260, h: 459 },
                player:  { x: 760, y: 720 },
                arrive:  { x: 1330, y: 620 },   // 從大廳左門進來→落在交易所右側(右拱門旁)
                rabbitPos: { x: 773, y: 365 },  // 白兔站櫃台前(擺設模式可拖)
                boundary: [ { x: 120, y: 250 }, { x: 1440, y: 250 }, { x: 1470, y: 900 }, { x: 90, y: 900 } ],
                actorScale: 0.7,
            },
            walls: [],
            doors: [
                { x: 1423, y: 513, w: 55, h: 158, to: 'hall', spawn: { x: 175, y: 600 } },   // 右拱門→回純白大廳(落在大廳左門內側)
            ],
            doorsV: 1,
            rabbit: { x: 773, y: 365 },   // 觸發 lobby_npcs 的 if(SC.rabbit)：白兔先生站櫃台
        },
        city: {   // 🏙 視差城市廣場＝分層可走（新版：手繪遮罩碰撞，同大廳；前景建築物件各自深度排序）
            base: 'city/city_floor_v2.png',        // 廣場地板 v2（MC家地塊框已拆出→改獨立sprite）；建築/噴泉/樹走前景物件
            mask: 'city/city_floor_mask_v1.png',   // 手繪碰撞遮罩(白=可走)；改吃遮罩、不再用格子
            lower: 'city/obj/city_floor_frame_upper_part.png',   // 背景層：北牆(後牆)在底圖上、被所有物件遮住
            upper: 'city/obj/city_floor_frame_lower_part.png',   // 前景層：南牆(前牆)疊最上、壓住走到下緣的小人
            alphaFoot: true,   // 🏢 建築照真實輪廓(alpha)擋，但✂️只算底部「佔地高」那一帶→上半可走過去(小人繞屋後)；佔地高可調
            nightBase: 'city/city_floor_night.png',   // 🌙 夜版地板；物件/牆框夜版走 CITY_NIGHT 對照表（2026-07-20 夜版素材上齊,解鎖日夜）
            cfgKey: 'lobby_stage_layout_city_v8',   // v8=Rae定版佈局烤進預設+地塊(plot)欄位（v7舊存檔作廢，內容=同一份定版不掉東西）
            outdoor: true,     // 戶外：小人跟鏡頭脫鉤=固定螢幕尺寸俯視小棋子
            // 前景物件＝獨立元素（書咖/大廳/房子/噴泉/樹/燈柱/長椅）；noCollide=不進碰撞(碰撞全走遮罩)；
            //   靠 z=2+(y+h) 深度排序＝腳y比它低走前面、比它高走後面。
            // 🏘 plot='npc01..04'＝NPC房；plotFrame=同編號的空地框。一塊地「空地↔蓋房」二選一顯示（setPlot 切換）。
            layout: [   // ⬇ Rae 2026-07-20 擺設模式定版（地塊框對位版）
                { file: "city/obj/book_cafe_day.png", x: 173, y: 90, w: 424, h: 346, footH: 194, s: 0.77, layer: "floor" },   // 書咖建築
                { file: "city/obj/lobby_day.png", x: 976, y: 308, w: 468, h: 350, footH: 155, s: 0.827 },   // 大廳建築（回大廳門接這棟）
                { file: "city/obj/player_house_lv1.png", x: 97, y: 565, w: 1284, h: 750, footH: 350, footW: 1272, s: 0.402, plot: "player" },   // MC家（跟白兔買了才蓋起來；狀態=OS_PT）
                { file: "city/obj/npc_house_01.png", x: 874, y: 638, w: 1095, h: 839, footH: 445, s: 0.274, plot: "npc01" },
                { file: "city/obj/npc_house_02.png", x: 1182, y: 580, w: 794, h: 853, footH: 339, s: 0.327, plot: "npc02" },
                { file: "city/obj/npc_house_03.png", x: 990, y: 128, w: 1030, h: 814, footH: 288, s: 0.281, plot: "npc03" },
                { file: "city/obj/npc_house_04.png", x: 164, y: 327, w: 1093, h: 850, footH: 388, s: 0.271, plot: "npc04" },
                { file: "city/obj/plot_frame_day_player.png", x: 156, y: 619, w: 1342, h: 836, footH: 0, s: 0.308, layer: "floor", noCollide: true, plotFrame: "player" },   // MC家空地框(沒買房時顯示)
                { file: "city/obj/plot_frame_day_npc01.png", x: 889, y: 639, w: 357, h: 342, footH: 0, s: 0.673, layer: "floor", noCollide: true, plotFrame: "npc01" },
                { file: "city/obj/plot_frame_day_npc02.png", x: 1180, y: 643, w: 342, h: 340, footH: 0, s: 0.684, layer: "floor", noCollide: true, plotFrame: "npc02" },
                { file: "city/obj/plot_frame_day_npc03.png", x: 992, y: 152, w: 398, h: 300, footH: 0, s: 0.657, layer: "floor", noCollide: true, plotFrame: "npc03" },
                { file: "city/obj/plot_frame_day_npc04.png", x: 164, y: 337, w: 411, h: 305, footH: 0, s: 0.72, layer: "floor", noCollide: true, plotFrame: "npc04" },
                { file: "city/obj/fountain_node_day.png", x: 706, y: 325, w: 180, h: 222, footH: 67, s: 0.799 },
                { file: "city/obj/crystal_monument_day.png", x: 1086, y: 485, w: 151, h: 352, footH: 113, s: 0.322 },
                { file: "city/obj/crystal_monument_day.png", x: 1224, y: 485, w: 151, h: 352, footH: 113, s: 0.322 },
                { file: "city/obj/city_sign_01_day.png", x: 463, y: 234, w: 173, h: 371, footH: 87, s: 0.201 },
                { file: "city/obj/terminal_02_day.png", x: 819, y: 73, w: 131, h: 235, footH: 62, s: 0.391 },
                { file: "city/obj/street_lamp_02_day.png", x: 559, y: 325, w: 105, h: 379, footH: 68, s: 0.242 },
                { file: "city/obj/street_lamp_02_day.png", x: 944, y: 325, w: 105, h: 379, footH: 68, s: 0.242, flipX: true },
                { file: "city/obj/civic_light_cylinder_day.png", x: 1322, y: 112, w: 126, h: 196, footH: 85, s: 0.308, layer: "back" },
                { file: "city/obj/conifer_tall_01_day.png", x: 904, y: 175, w: 157, h: 332, footH: 220, s: 0.271 },
                { file: "city/obj/conifer_tall_02_day.png", x: 583, y: 175, w: 163, h: 328, footH: 219, s: 0.28 },
                { file: "city/obj/tree_square_01_day.png", x: 590, y: 275, w: 159, h: 217, footH: 110, s: 0.31 },
                { file: "city/obj/tree_square_01_day.png", x: 886, y: 275, w: 159, h: 217, footH: 110, s: 0.31, flipX: true },
                { file: "city/obj/tree_square_01_day.png", x: 590, y: 550, w: 159, h: 217, footH: 110, s: 0.31, flipX: true },
                { file: "city/obj/tree_square_01_day.png", x: 896, y: 550, w: 159, h: 217, footH: 110, s: 0.31, flipX: true },
                { file: "city/obj/city_bench_06_day.png", x: 1257, y: 95, w: 328, h: 280, footH: 280, s: 0.234, layer: "floor" },
                { file: "city/obj/city_bench_horizontal_02_day.png", x: 543, y: 109, w: 510, h: 228, footH: 148, s: 0.21 },
                { file: "city/obj/city_bench_horizontal_02_day.png", x: 866, y: 108, w: 510, h: 228, footH: 158, s: 0.21 },
                { file: "city/obj/city_bench_horizontal_03_day.png", x: 856, y: 530, w: 361, h: 164, footH: 109, s: 0.193 },
                { file: "city/obj/city_bench_horizontal_03_day.png", x: 621, y: 530, w: 361, h: 164, footH: 109, s: 0.193, flipX: true },
                { file: "city/obj/city_bench_horizontal_03_day.png", x: 621, y: 340, w: 361, h: 164, footH: 109, s: 0.193, flipX: true },
                { file: "city/obj/city_bench_horizontal_03_day.png", x: 856, y: 340, w: 361, h: 164, footH: 109, s: 0.193 },
                { file: "city/obj/city_bench_horizontal_05_day.png", x: 192, y: 920, w: 447, h: 191, footH: 107, s: 0.204, flipX: true },
                { file: "city/obj/city_bench_horizontal_05_day.png", x: 392, y: 919, w: 447, h: 191, footH: 107, s: 0.204 },
                { file: "city/obj/city_bench_horizontal_05_day.png", x: 1033, y: 919, w: 447, h: 191, footH: 107, s: 0.204, flipX: true },
                { file: "city/obj/city_bench_horizontal_05_day.png", x: 1233, y: 918, w: 447, h: 191, footH: 107, s: 0.204 },
                { file: "city/obj/planter_long_01_day.png", x: 299, y: 920, w: 403, h: 191, footH: 101, s: 0.202 },
                { file: "city/obj/planter_long_01_day.png", x: 1140, y: 919, w: 403, h: 191, footH: 111, s: 0.202 },
                { file: "city/obj/planter_long_02_day.png", x: 445, y: 114, w: 360, h: 149, footH: 85, s: 0.289 },
                { file: "city/obj/planter_long_02_day.png", x: 978, y: 113, w: 360, h: 149, footH: 85, s: 0.284 },
                { file: "city/obj/planter_long_03_day.png", x: 879, y: 914, w: 442, h: 146, footH: 84, s: 0.318 },
                { file: "city/obj/planter_medium_01_day.png", x: 503, y: 916, w: 310, h: 188, footH: 86, s: 0.23 },
            ],
            points: {
                npcZone: { x: 668, y: 968, w: 1430, h: 869 },   // 客人出沒區（Rae定版）
                player: { x: 768, y: 620 },
                arrive: { x: 768, y: 580 },   // 從書咖/大廳出來的落點（廣場中央）
                actorScale: 0.32,             // 🗺️ 地圖俯視小棋子（脫鉤鏡頭後≈螢幕高比例）
            },
            walls: [],   // 碰撞全走手繪遮罩
            doors: [
                { x: 335, y: 316, w: 100, h: 42, to: 'cafe', spawn: { x: 780, y: 868 } },   // 書咖門口→瀅瀅書咖（走到門口下方觸發）
                { x: 1136, y: 570, w: 86, h: 24, to: 'hall', spawn: { x: 772, y: 830 } },   // 大廳建築門口→愛麗絲純白大廳
            ],
        },
    };
    // 🌙 城市夜版素材對照：日檔→夜檔。放 runtime 對照而非寫進 layout——Rae 的擺設存檔(layoutFull)
    //    不帶 nightFile 欄位也能換夜；o.nightFile 手動欄位優先於這張表。特例：大廳門面樓夜版檔名叫 exchange_night。
    const CITY_NIGHT = {
        'city/city_floor_v1.png': 'city/city_floor_night.png',
        'city/obj/city_floor_frame_upper_part.png': 'city/obj/city_floor_night_frame_upper_part.png',
        'city/obj/city_floor_frame_lower_part.png': 'city/obj/city_floor_night_frame_lower_part.png',
        'city/obj/book_cafe_day.png': 'city/obj/book_cafe_night.png',
        'city/obj/lobby_day.png': 'city/obj/exchange_night.png',
        'city/obj/player_house_lv1.png': 'city/obj/player_house_lv1_night.png',
        'city/obj/npc_house_01.png': 'city/obj/npc_house_01_night.png',
        'city/obj/npc_house_02.png': 'city/obj/npc_house_02_night.png',
        'city/obj/npc_house_03.png': 'city/obj/npc_house_03_night.png',
        'city/obj/npc_house_04.png': 'city/obj/npc_house_04_night.png',
        'city/obj/city_bench_01_day.png': 'city/obj/city_bench_01_night.png',
        'city/obj/city_bench_horizontal_02_day.png': 'city/obj/city_bench_horizontal_02_night.png',
        'city/obj/city_bench_horizontal_03_day.png': 'city/obj/city_bench_horizontal_03_night.png',
        'city/obj/city_bench_horizontal_05_day.png': 'city/obj/city_bench_horizontal_05_night.png',
        'city/obj/city_sign_01_day.png': 'city/obj/city_sign_01_night.png',
        'city/obj/civic_light_cylinder_day.png': 'city/obj/civic_light_cylinder_night.png',
        'city/obj/conifer_tall_01_day.png': 'city/obj/conifer_tall_01_night.png',
        'city/obj/conifer_tall_02_day.png': 'city/obj/conifer_tall_02_night.png',
        'city/obj/crystal_monument_day.png': 'city/obj/crystal_monument_night.png',
        'city/obj/fountain_node_day.png': 'city/obj/fountain_node_night.png',
        'city/obj/planter_long_01_day.png': 'city/obj/planter_long_01_night.png',
        'city/obj/planter_long_02_day.png': 'city/obj/planter_long_02_night.png',
        'city/obj/planter_long_03_day.png': 'city/obj/planter_long_03_night.png',
        'city/obj/planter_medium_01_day.png': 'city/obj/planter_medium_01_night.png',
        'city/obj/street_lamp_02_day.png': 'city/obj/street_lamp_02_night.png',
        'city/obj/terminal_02_day.png': 'city/obj/terminal_02_night.png',
        'city/obj/tree_square_01_day.png': 'city/obj/tree_square_01_night.png',
        'city/obj/plot_frame_day_npc01.png': 'city/obj/plot_frame_night_npc01.png',
        'city/obj/plot_frame_day_npc02.png': 'city/obj/plot_frame_night_npc02.png',
        'city/obj/plot_frame_day_npc03.png': 'city/obj/plot_frame_night_npc03.png',
        'city/obj/plot_frame_day_npc04.png': 'city/obj/plot_frame_night_npc04.png',
        'city/obj/plot_frame_day_player.png': 'city/obj/plot_frame_night_player.png',
    };
    // 🩹 地塊框改版導向（2026-07-20 Rae 重編號）：舊存檔裡的舊框檔名→新檔+新原始尺寸。
    //    _loadCfg 載入時就地換掉→存檔不用手動改；她下次「完成」存檔即自動寫成新檔名。
    const PLOT_FRAME_FIX = {
        'city/obj/plot_frame_small_02_day.png': { file: 'city/obj/plot_frame_day_npc01.png', w: 357, h: 342 },
        'city/obj/plot_frame_small_03_day.png': { file: 'city/obj/plot_frame_day_npc02.png', w: 342, h: 340 },
        'city/obj/plot_frame_small_04_day.png': { file: 'city/obj/plot_frame_day_npc03.png', w: 398, h: 300 },
        'city/obj/plot_frame_small_05_day.png': { file: 'city/obj/plot_frame_day_npc04.png', w: 411, h: 305 },
    };
    // 🌗 城市日夜：跟大廳 BG 同時段律（ambient.js：6-18=day）；場景有 nightBase 才生效
    function _isNightNow() {
        const h = new Date().getHours();
        return !(h >= 6 && h < 18);
    }
    // 場景實際是否夜間：帶 forceDay 的場景永遠白天（不跟時間走）
    function _sceneIsNight(SC) {
        return !!(SC && !SC.forceDay && _isNightNow());
    }
    function _sceneBase(SC) {
        return (SC.nightBase && _sceneIsNight(SC)) ? SC.nightBase : SC.base;
    }
    // 物件有效尺寸（s=個別縮放，預設1；佔地跟著縮）
    // footW=佔地寬(未縮放，預設=全寬)；佔地框水平置中（treats 上寬下窄的懸浮物）
    function effDims(o) {
        const s = o.s || 1;
        return {
            ew: Math.round(o.w * s), eh: Math.round(o.h * s),
            ef: Math.round((o.footH || 0) * s),
            efw: Math.round((o.footW != null ? o.footW : o.w) * s),
        };
    }
    // 佔地框＝物件底部那條「地面帶」：全寬(或 footW)、高 footH、底部對齊、水平置中。
    //   一般家具＝這塊矩形直接當碰撞；alphaFoot 場景(大地圖)＝這塊只當「切線高度」，實際擋路形狀交給圖片 alpha。
    function footRect(o) {
        const d = effDims(o);
        return { x: o.x + Math.round((d.ew - d.efw) / 2), y: o.y + d.eh - d.ef, w: d.efw, h: d.ef };
    }

    // ── 🧱 建構模式資產庫（上傳的圖存 IndexedDB，localStorage 只存引用）──
    function idbOpen() {
        return new Promise((res, rej) => {
            const rq = indexedDB.open('lobby_stage_assets', 1);
            rq.onupgradeneeded = () => rq.result.createObjectStore('imgs');
            rq.onsuccess = () => res(rq.result);
            rq.onerror = () => rej(rq.error);
        });
    }
    async function idbPut(key, val) {
        const db = await idbOpen();
        return new Promise((res, rej) => {
            const tx = db.transaction('imgs', 'readwrite');
            tx.objectStore('imgs').put(val, key);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    }
    async function idbGet(key) {
        const db = await idbOpen();
        return new Promise((res, rej) => {
            const rq = db.transaction('imgs').objectStore('imgs').get(key);
            rq.onsuccess = () => res(rq.result || null);
            rq.onerror = () => rej(rq.error);
        });
    }
    // 圖片引用解析：{file}=CDN內建、{url}=外部網址、{idb}=本機上傳
    async function resolveRef(ref) {
        if (!ref) return null;
        if (ref.url) return ref.url;
        if (ref.idb) { try { return await idbGet(ref.idb); } catch (e) { return null; } }
        if (ref.file) return CDN + ref.file;
        return null;
    }

    // 讀取佈局：本機調過的蓋過預設（每場景各存各的）
    // 新版存 layoutFull=完整家具清單（可增刪）；舊版 layout=按 file 名對位覆蓋（相容）
    function _loadCfg() {
        const SC = SCENES[S.scene];
        let layout = (SC.layout || []).map(o => Object.assign({}, o));
        const points = JSON.parse(JSON.stringify(SC.points || {}));
        const doors = (SC.doors || []).map(d => Object.assign({}, d));   // 靜態地圖沒 doors→給空陣列，別讓 undefined.map 炸掉整個掛載
        let baseOverride = null, maskOverride = null;
        try {
            const saved = JSON.parse(localStorage.getItem(SC.cfgKey) || 'null');
            if (saved) {
                if (Array.isArray(saved.layoutFull) && saved.layoutFull.length) {
                    layout = saved.layoutFull.map(o => Object.assign({}, o));
                    layout.forEach(o => {   // 🩹 地塊框改版導向：舊框檔名就地換新檔+新原始尺寸（保留她調過的 x/y/s）
                        const fix = PLOT_FRAME_FIX[o.file];
                        if (fix) { o.file = fix.file; o.w = fix.w; o.h = fix.h; }
                    });
                    // 🩹 底板v2把MC家地塊框拆出來了：舊存檔沒有這件→補進去（有了就不重複）
                    if (S.scene === 'city' && !layout.some(o => o.file === 'city/obj/plot_frame_day_player.png')) {
                        const def = (SC.layout || []).find(o => o.file === 'city/obj/plot_frame_day_player.png');
                        if (def) layout.push(Object.assign({}, def));
                    }
                    layout.forEach(o => {   // 🩹 舊存檔的MC房/框補地塊編號（MC房=買了才蓋,狀態接OS_PT）
                        if (o.file === 'city/obj/player_house_lv1.png' && !o.plot) o.plot = 'player';
                        if (o.file === 'city/obj/plot_frame_day_player.png' && !o.plotFrame) o.plotFrame = 'player';
                    });
                } else (saved.layout || []).forEach(s => {
                    const t = layout.find(o => o.file === s.file);
                    if (t) { t.x = s.x; t.y = s.y; if (s.footH != null) t.footH = s.footH; if (s.footW != null) t.footW = s.footW; if (s.s != null) t.s = s.s; if (s.layer != null) t.layer = s.layer; if (s.flipX != null) t.flipX = s.flipX; if (s.noCollide != null) t.noCollide = s.noCollide; }
                });
                if (saved.baseOverride) baseOverride = saved.baseOverride;
                if (saved.maskOverride) maskOverride = saved.maskOverride;
                // doorsV 版本閘：場景門的「去向/配置」改版後，舊存檔的門座標整組作廢（防蓋到新門上）
                if (Array.isArray(saved.doors) && (saved.doorsV || 1) === (SC.doorsV || 1)) saved.doors.forEach((sd, i) => {
                    if (doors[i] && sd) { doors[i].x = sd.x; doors[i].y = sd.y; doors[i].w = sd.w; doors[i].h = sd.h; }
                });
                if (saved.points) {
                    if (saved.points.yingZone) points.yingZone = saved.points.yingZone;
                    if (saved.points.npcZone) points.npcZone = saved.points.npcZone;
                    if (saved.points.player) points.player = saved.points.player;
                    if (saved.points.arrive) points.arrive = saved.points.arrive;
                    if (saved.points.alicePos) points.alicePos = saved.points.alicePos;
                    if (saved.points.cheshirePos) points.cheshirePos = saved.points.cheshirePos;
                    if (saved.points.rabbitPos) points.rabbitPos = saved.points.rabbitPos;
                    if (Array.isArray(saved.points.boundary) && saved.points.boundary.length >= 3) points.boundary = saved.points.boundary;
                    if (saved.points.actorScale != null) points.actorScale = saved.points.actorScale;
                }
            }
        } catch (e) {}
        return { layout, points, doors, baseOverride, maskOverride };
    }

    const S = {
        root: null, world: null, scale: 1,
        raf: 0, last: 0, active: false,
        scene: 'cafe',              // 目前場景（每次開大廳從書咖開始）
        spawnOverride: null,        // 過門後的抵達點
        doorCd: 0,                  // 過門冷卻（防止落地瞬間又觸發）
        doorArm: false,             // 門武裝狀態：落地後走出門區一次才重新啟動
        transitioning: false,
        player: null, npcs: [], talkTarget: null, followers: [],
        keys: {}, onKey: null,
        objEls: [],                 // 物件 img（跟 CFG.layout 同序）
        edit: null,                 // 擺設模式狀態
    };
    let CFG = null;   // tryMount 時按場景載入
    let _lpSuppressClick = false;   // 長按開選單後，抑制隨之而來的那次 click（免點擊移動誤觸）

    function isOn() { try { return localStorage.getItem('lobby_stage_on') !== '0'; } catch (e) { return true; } }

    // ── 碰撞（優先序：手繪遮罩 > 鋼索/牆矩形；家具腳印/alpha 形狀永遠有效）──
    let BLOCKS = [];          // 矩形腳印（一般家具）
    let ALPHA_BLOCKS = [];    // alpha 形狀擋路（大地圖建築：照圖形狀，只擋 footRect 底帶）
    function rebuildBlocks() {
        const maskOk = !!(S.mask && S.mask.ok);
        const alpha = !!SCENES[S.scene].alphaFoot;
        const feet = alpha ? [] : CFG.layout.filter(o => !o.noCollide && !o._plotOff).map(footRect);   // alphaFoot 不用腳印；noCollide 物件(城市前景)不擋路→碰撞全走遮罩
        BLOCKS = (maskOk ? [] : (SCENES[S.scene].walls || [])).concat(feet);   // 靜態地圖沒 walls→空陣列，別 undefined.concat 炸掉掛載
        ALPHA_BLOCKS = alpha ? CFG.layout.filter(o => o._alpha && !o.noCollide && !o._plotOff) : [];   // 只納入已載好 alpha 且沒設「不擋路」的物件（noCollide/隱藏地塊 在 alphaFoot 也生效）
    }
    // ── 🏘 地塊入住狀態（NPC房：空地框↔蓋房二選一顯示；經濟③入住流程接 setPlot）──
    //    小資料走 localStorage（🚨別動 OS_DB schema——升版加 store 會 deadlock）
    const PLOTS_KEY = 'lobby_city_plots_v1';
    function _plots() { try { return JSON.parse(localStorage.getItem(PLOTS_KEY) || '{}'); } catch (e) { return {}; } }
    function _plotOccupied(id) { const v = _plots()[id]; return v == null ? false : !!v; }   // 預設一律空地（Rae 2026-07-20 定案）：MC地=買了才蓋(真狀態OS_PT)；NPC地=入住流程蓋(待做)
    function _applyPlotVis(o, img) {
        const off = (o.plot && !_plotOccupied(o.plot)) || (o.plotFrame && _plotOccupied(o.plotFrame));
        o._plotOff = !!off;
        if (img) img.classList.toggle('lstage-plot-off', !!off);
    }
    function setPlot(id, occupied) {
        try { const all = _plots(); all[id] = !!occupied; localStorage.setItem(PLOTS_KEY, JSON.stringify(all)); } catch (e) {}
        (CFG?.layout || []).forEach((o, i) => {
            if (o.plot === id || o.plotFrame === id) _applyPlotVis(o, S.objEls?.[i]);
        });
        rebuildBlocks();
    }
    // 💰 買房即時反映：交易所(os_pt)買下→白兔那邊發事件→這裡把空地換成房子
    window.addEventListener('os-pt-plot-changed', (e) => {
        try { if (e.detail) setPlot(String(e.detail.plotId || 'player'), !!e.detail.built); } catch (err) {}
    });
    // alpha 形狀擋路：x那一直柱、y0..y1那段裡只要有「不透明像素(alpha≥128)」=牆。
    //   ✂️ 只算「底部 footH 那一帶」的形狀→照建築真實輪廓擋底部，上半可走過去(小人繞到建築後面)；footH 高度可調。
    //   掃整段而非點採樣：佔地高調薄(帶高<步長)時，點採樣會從縫隙間跳過去（穿樓）。
    function _alphaSpan(o, x, y0, y1) {
        const a = o._alpha, s = o.s || 1;
        let lx = (x - o.x) / s;
        if (lx < 0 || lx >= o.w) return false;
        if (o.flipX) lx = o.w - 1 - lx;   // 物件水平翻轉→碰撞座標也鏡像（不然圖在右、碰撞在左）
        const fh = (o.footH != null ? o.footH : o.h);   // 佔地高(未縮放px)；沒設=整棟
        const top = Math.max((y0 - o.y) / s, o.h - fh); // 上半(超過佔地高的部分)不擋→可走屋後
        const bot = Math.min((y1 - o.y) / s, o.h);
        if (top > bot || bot < 0 || top >= o.h) return false;
        const ax = Math.min(a.w - 1, Math.floor(lx / o.w * a.w));
        const r0 = Math.max(0, Math.floor(top / o.h * a.h));
        const r1 = Math.min(a.h - 1, Math.floor(bot / o.h * a.h));
        for (let r = r0; r <= r1; r++) if (a.data[r * a.w + ax] >= 128) return true;
        return false;
    }
    // 從已載好的物件 <img> 抽 alpha 通道存降採樣點陣（o._alpha={w,h,data}）；載好後重建碰撞。
    //   只留 alpha 一個 byte、200px 上限省記憶體；編輯中順便刷新剪影。
    function _extractObjAlpha(o, imgEl) {
        try {
            const nw = imgEl.naturalWidth || o.w, nh = imgEl.naturalHeight || o.h;
            const k = Math.min(1, 200 / Math.max(nw, nh));
            const aw = Math.max(1, Math.round(nw * k)), ah = Math.max(1, Math.round(nh * k));
            const cv = document.createElement('canvas');
            cv.width = aw; cv.height = ah;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(imgEl, 0, 0, aw, ah);
            const px = ctx.getImageData(0, 0, aw, ah).data;
            const data = new Uint8Array(aw * ah);
            let opaque = 0;
            for (let i = 0; i < aw * ah; i++) { data[i] = px[i * 4 + 3]; if (data[i] >= 128) opaque++; }
            o._alpha = { w: aw, h: ah, data };
            rebuildBlocks();
            if (S.edit) { try { window.LobbyEditor?.syncFeet?.(); } catch (e) {} }   // 編輯中→刷新剪影
            console.log('[LobbyStage] 物件 alpha OK', o.file || o.url, aw + 'x' + ah, '不透明像素', opaque);
        } catch (e) { console.warn('[LobbyStage] 物件 alpha 讀取失敗(CORS?)', o.file || o.url, e); }
    }
    // 手繪碰撞遮罩：白=可走、黑=不可走（<128 判黑）；jsdelivr 有 CORS 頭、canvas 可讀
    async function loadMask() {
        S.mask = null;
        S.maskFailed = false;   // 重置：載入前先當「載入中」→blocked 空窗期全擋（防穿牆）
        const ovSrc = await resolveRef(CFG.maskOverride);   // 建構模式「換遮罩」優先
        const file = SCENES[S.scene].mask;
        const src = ovSrc || (file ? CDN + file : null);
        if (!src) { S.maskFailed = true; return; }   // 場景本來就沒遮罩→解除空窗期全擋
        const img = new Image();
        if (!String(src).startsWith('data:')) img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const cv = document.createElement('canvas');
                cv.width = MAP_W; cv.height = MAP_H;
                const ctx = cv.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
                S.mask = { ok: true, data: ctx.getImageData(0, 0, MAP_W, MAP_H).data };
                rebuildBlocks();   // 遮罩生效→退役鋼索/牆矩形
                // 遮罩比出生時晚到：發現人站在黑色區→彈到最近地板
                if (S.player && blocked(S.player.x, S.player.y)) {
                    const sp = findFreeSpot(S.player.x, S.player.y);
                    S.player.x = sp.x; S.player.y = sp.y;
                    placeActor(S.player);
                }
                console.log('[LobbyStage] 碰撞遮罩已載入', file);
            } catch (e) { S.maskFailed = true; console.warn('[LobbyStage] 遮罩讀取失敗(退回鋼索/放行移動)', e); }
        };
        img.onerror = () => { S.maskFailed = true; console.warn('[LobbyStage] 遮罩下載失敗(放行移動)', src); };
        img.src = src;
    }
    const FOOT_W = 46, FOOT_H = 18;
    // 射線法：點是否在多邊形內（外框鋼索用，用腳點中心判定）
    function insidePoly(pts, x, y) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }
    // 找最近可走點（落點在牆裡/黑色遮罩上時自動彈出，螺旋環搜尋）
    function findFreeSpot(x, y) {
        if (!blocked(x, y)) return { x, y };
        for (let r = 12; r <= 320; r += 12) {
            for (let a = 0; a < 16; a++) {
                const rad = a * Math.PI / 8;
                const nx = x + Math.cos(rad) * r, ny = y + Math.sin(rad) * r;
                if (nx > 0 && nx < MAP_W && ny > 0 && ny < MAP_H && !blocked(nx, ny)) return { x: nx, y: ny };
            }
        }
        return { x, y };
    }
    // 🧭 站位開闊度：以 (x,y) 為中心、半徑 r 的採樣圈裡「白像素(可走)比例」。
    //   Rae 的點子：拿手繪遮罩找「最多%白」的地方當站位——遮罩本來就已載進記憶體(S.mask.data)，
    //   純資料採樣、零安裝、手機一樣跑；遮罩還沒載到就退回單點 blocked 判定(=現狀)。
    function _whiteRatio(x, y, r) {
        if (!(S.mask && S.mask.ok)) return blocked(x, y) ? 0 : 1;
        const D = S.mask.data;
        let ok = 0, n = 0;
        const step = Math.max(6, Math.round(r / 6));
        for (let dy = -r; dy <= r; dy += step) {
            for (let dx = -r; dx <= r; dx += step) {
                if (dx * dx + dy * dy > r * r) continue;
                n++;
                const px = Math.round(x + dx), py = Math.round(y + dy);
                if (px < 0 || py < 0 || px >= MAP_W || py >= MAP_H) continue;   // 圈超出地圖=不算白
                if (D[((py * MAP_W) + px) * 4] >= 128) ok++;
            }
        }
        return n ? ok / n : 0;
    }
    // 🟦 格子碰撞：格子表寫死在場景(base64 bit-packed)，腳點落在「1」格=牆。首次用時解碼快取到 g._bits。
    function _gridBlocked(g, x, y) {
        if (!g._bits) {
            const bin = atob(g.bits); const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            g._bits = arr;
        }
        const col = Math.floor(x / g.cell), row = Math.floor(y / g.cell);
        if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return true;
        const bi = row * g.cols + col;
        return ((g._bits[bi >> 3] >> (7 - (bi & 7))) & 1) === 1;
    }
    // 單點是不是牆（格子/遮罩/鋼索）——不含腳印寬度
    function _wallAt(x, y) {
        const SC = SCENES[S.scene];
        if (SC && SC.grid) return _gridBlocked(SC.grid, x, y);        // 🟦 格子碰撞（寫死、永不載入失敗）
        if (SC && SC.mask && !(S.mask && S.mask.ok)) return !S.maskFailed;   // 遮罩載入中→空窗期全擋防穿牆
        if (S.mask && S.mask.ok) {
            const mi = ((Math.round(y) * MAP_W) + Math.round(x)) * 4;
            return S.mask.data[mi] < 128;   // 手繪遮罩：<128=不可走
        }
        const P = CFG?.points?.boundary;
        return !!(P && P.length >= 3 && !insidePoly(P, x, y));   // 鋼索圈外=牆
    }
    function blocked(x, y, hw) {
        const fw = (hw && hw > 4) ? hw * 2 : FOOT_W;   // 有量到角色實際半寬就用它，否則退回 FOOT_W
        const l = x - fw / 2, t = y - FOOT_H, r = x + fw / 2, b = y;
        if (l < 0 || r > MAP_W || t < 0 || b > MAP_H) return true;
        // 🚨 採樣腳印矩形(中心+左右邊+四角)而非單點→小人身體有寬度，側面靠牆時邊緣就擋住，不會整個身體穿進去
        if (_wallAt(x, y) || _wallAt(l, b) || _wallAt(r, b) || _wallAt(l, t) || _wallAt(r, t) || _wallAt(x, t)) return true;
        if (BLOCKS.some(B => l < B.x + B.w && r > B.x && t < B.y + B.h && b > B.y)) return true;
        // alpha 建築：腳印左/中/右三條直柱各掃 [t..b] 整段——只驗腳中心單點的話，斜著靠近/凹角處身體會鑽進紅區
        for (let i = 0; i < ALPHA_BLOCKS.length; i++) {
            const A = ALPHA_BLOCKS[i];
            if (_alphaSpan(A, l, t, b) || _alphaSpan(A, x, t, b) || _alphaSpan(A, r, t, b)) return true;
        }
        return false;
    }
    // 🧈 絲滑移動（玩家用）：直走→被擋就把方向轉 ±25/50/75° 用同樣步長試走（牆滑+轉角助推）。
    //   市面2D的手感來源：撞到不急停，貼牆滑、擦角讓位；轉角最多75°=前進分量恆為正，朝目的地必收斂不繞圈。
    function _slideMove(p, ux, uy, L) {
        let nx = p.x + ux * L, ny = p.y + uy * L;
        if (!blockedPath(p.x, p.y, nx, ny, p.hw)) { p.x = nx; p.y = ny; return true; }
        for (const deg of [25, -25, 50, -50, 75, -75]) {
            const rad = deg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
            const rx = ux * c - uy * s, ry = ux * s + uy * c;
            nx = p.x + rx * L; ny = p.y + ry * L;
            if (!blockedPath(p.x, p.y, nx, ny, p.hw)) { p.x = nx; p.y = ny; return true; }
        }
        return false;   // 真的正面頂死平牆才原地不動
    }
    // 一整步拆小段沿路採樣：單幀最多走16.5px、只驗終點的話，薄的alpha邊緣會被一步跨過去（穿進建築）
    function blockedPath(x0, y0, x1, y1, hw) {
        const d = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.max(1, Math.ceil(d / 8));
        for (let i = 1; i <= n; i++) {
            if (blocked(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, hw)) return true;
        }
        return false;
    }

    // ── 角色（玩家/NPC 共用）────────────────────────────
    // src=字串→單張立姿圖；src={sheet:url}→3×4走路圖(真走路動畫,四方向)
    // 🗺️ 地圖場景(outdoor)的小人跟鏡頭 cover 縮放脫鉤：不管鏡頭把底圖放大幾倍，人都固定螢幕尺寸
    //    (俯視棋子；桌機/手機/橫豎屏一致)。室內房間維持原樣=跟著 cover 放大一起填滿畫面。
    function _actorScale() {
        let s = CFG.points.actorScale || 1;
        if (SCENES[S.scene] && SCENES[S.scene].outdoor && S.scale > 0 && isFinite(S.scale)) s = s / S.scale;
        return s;
    }
    // 🧍 量角色圖的「實際不透明範圍」→ 算下方padding(腳離圖底)+可見半寬比例，存 a.bpad/a.wfrac。
    //   圖多半是角色置中、四周留透明padding；不修的話錨點會錨在圖底(腳下方)、碰撞寬對不上→貼牆會穿/離。
    function _measureActorBounds(a) {
        if (a.sheet || !a.el || !a.el.naturalWidth) return;
        try {
            const iw = a.el.naturalWidth, ih = a.el.naturalHeight;
            const sw = 80, sh = Math.max(1, Math.round(ih * 80 / iw));
            const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(a.el, 0, 0, sw, sh);
            const d = ctx.getImageData(0, 0, sw, sh).data;
            let minX = sw, maxX = -1, maxY = -1;
            for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) {
                if (d[(yy * sw + xx) * 4 + 3] >= 40) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy > maxY) maxY = yy; }
            }
            if (maxY < 0) return;   // 全透明
            a.bpad = (sh - 1 - maxY) / sh;                // 下方padding比例(腳到圖底)
            a.wfrac = ((maxX - minX + 1) / 2) / sw;        // 可見半寬佔圖寬比例→碰撞半寬
            placeActor(a);                                 // 用新錨點/寬度重放
        } catch (e) { /* CORS污染等→維持預設(FOOT_W/圖底錨) */ }
    }
    // 🧍 走路圖(3×4)版量測：取中間立定幀量可見寬度→a.wfrac（碰撞半寬比例）。
    //   sheet 小人原本量不到實寬→blocked 退回寫死 FOOT_W=46：窄縫看起來能過、腳印卻塞不下=卡住。
    function _measureSheetBounds(a, probe) {
        try {
            const fw = Math.max(1, Math.floor(probe.naturalWidth / 3)), fh = Math.max(1, Math.floor(probe.naturalHeight / 4));
            const sw = 80, sh = Math.max(1, Math.round(fh * 80 / fw));
            const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(probe, fw, 0, fw, fh, 0, 0, sw, sh);   // 第2欄第1列=朝下立定幀
            const d = ctx.getImageData(0, 0, sw, sh).data;
            let minX = sw, maxX = -1;
            for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) {
                if (d[(yy * sw + xx) * 4 + 3] >= 40) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; }
            }
            if (maxX < 0) return;
            a.wfrac = ((maxX - minX + 1) / 2) / sw;
            placeActor(a);
        } catch (e) { /* CORS污染等→維持FOOT_W */ }
    }
    function spawnActor(src, x, y, h) {
        const isSheet = (typeof src === 'object' && src && src.sheet);
        const el = document.createElement(isSheet ? 'div' : 'img');
        // lstage-loading=先藏著，圖真的載好才顯示（防轉場時預設單圖閃一下才換成走路圖）
        el.className = 'lstage-actor' + (isSheet ? ' lstage-sheet' : '') + ' lstage-loading';
        const a = { x, y, baseH: h, h: Math.round(h * _actorScale()), el, walking: false, flip: false };
        if (isSheet) {
            a.sheet = true; a.dir = 0; a.frame = 1; a.animT = 0;
            const probe = new Image();
            if (!String(src.sheet).startsWith('data:')) probe.crossOrigin = 'anonymous';   // 要讀alpha量實寬
            probe.onload = () => {
                a.frameW = probe.naturalWidth / 3; a.frameH = probe.naturalHeight / 4;
                el.style.backgroundImage = 'url("' + src.sheet + '")';   // 🚨 CORS探針先載、bg再吃快取；反序會污染快取讀不到alpha
                _measureSheetBounds(a, probe);
                placeActor(a); a.el.classList.remove('lstage-loading');
            };
            probe.src = src.sheet;
        } else {
            if (!String(src).startsWith('data:')) el.crossOrigin = 'anonymous';   // 要讀alpha量範圍→掛CORS(jsdelivr有頭)
            el.src = src;
            el.style.height = a.h + 'px';
            // 有皮膚(3x4)待換的話先別顯示這張預設單圖，等 _swapActorSrc 換好才顯示
            el.addEventListener('load', () => { placeActor(a); _measureActorBounds(a); if (!a._skinPending) a.el.classList.remove('lstage-loading'); }, { once: true });
        }
        S.world.appendChild(el);
        placeActor(a);
        return a;
    }
    // 人物整體縮放即時套用（擺設模式「人物−/＋」用）
    function applyActorScale() {
        const s = _actorScale();
        const all = S.player ? [S.player].concat(S.npcs) : S.npcs;
        all.forEach(a => {
            a.h = Math.round(a.baseH * s);
            a.el.style.height = a.h + 'px';
            placeActor(a);
            if (a.tag) placeNpcExtras(a);
        });
    }
    // 景深「往前」容差：大地圖(outdoor)角色站在物件底線稍高處仍算前面→貼著高樹/建築走不會頭被遮；室內不動
    function _actorZBias(a) {
        return (SCENES[S.scene] && SCENES[S.scene].outdoor) ? Math.round(a.h * 0.2) : 0;
    }
    // 👻 屋子透視（Rae選2號進化版，棄圓形洞）：小人走到「屋子」後面→那棟整體變半透明，
    //    但底座（佔地帶那段）保持不透明+往上羽化過渡＝底部 3D 感（模擬市民風）；走開就恢復。
    //    只對屋子生效（看板/樹/燈等小物件不做）；只在 alphaFoot 場景（大地圖）啟用。
    //    遮罩是縱向漸層→flipX 水平鏡像不影響，不用修座標。
    function _isXray(o) {
        if (o.xray) return true;    // 手動旗標（新屋子可在數據裡加 "xray":true）
        if (o.plot) return true;    // NPC 房
        return /book_cafe|lobby_day|player_house/.test(String(o.file || ''));   // 書咖/大廳/MC家
    }
    let _seeThruEls = new Set();
    function _updateSeeThrough() {
        const p = S.player;
        const on = p && CFG && SCENES[S.scene].alphaFoot;
        const next = new Set();
        if (on) {
            const pw = p.h * ((p.frameW && p.frameH) ? p.frameW / p.frameH : 0.6);
            const pl = p.x - pw / 2, pt = p.y - p.h;
            const pz = 2 + Math.round(p.y) + _actorZBias(p);   // 同 placeActor 的 z
            CFG.layout.forEach((o, i) => {
                const el = S.objEls?.[i];
                if (!el || o.layer || o._plotOff || !_isXray(o)) return;
                const s = o.s || 1, ew = Math.round(o.w * s), eh = Math.round(o.h * s);
                if (2 + Math.round(o.y + eh + (o.zb || 0)) <= pz) return;              // 沒畫在小人前面
                if (!(pl < o.x + ew && pl + pw > o.x && pt < o.y + eh && p.y > o.y)) return;   // 畫面沒疊到
                const fh = Math.round((o.footH != null ? o.footH : 0) * s);   // 底座=佔地帶，保持不透明
                const m = 'linear-gradient(to top, #000 0px, #000 ' + fh + 'px, rgba(0,0,0,.38) ' + (fh + 60) + 'px)';
                if (el._mask !== m) { el.style.webkitMaskImage = m; el.style.maskImage = m; el._mask = m; }
                next.add(el);
            });
        }
        _seeThruEls.forEach(el => { if (!next.has(el)) { el.style.webkitMaskImage = ''; el.style.maskImage = ''; el._mask = null; } });
        _seeThruEls = next;
    }
    function placeActor(a) {
        if (a.sheet) return placeSheetActor(a);
        const ratio = (a.el.naturalWidth && a.el.naturalHeight) ? a.el.naturalWidth / a.el.naturalHeight : 0.6;
        const w = a.h * ratio;
        // 碰撞半寬=可見角色半寬(量到才設；沒量到 blocked 用 FOOT_W)。
        // 🚨 用「邏輯尺寸」算(人物縮放,不含 outdoor 鏡頭脫鉤放大)：視覺放大是棋子表現,腳印跟著放大會變巨人塞不過縫
        if (a.wfrac != null) a.hw = Math.max(6, Math.round(a.baseH * (CFG.points.actorScale || 1) * ratio * a.wfrac));
        // 下方padding修正：把圖往下推 bpad*h，讓「可見的腳」正好落在 a.y(=碰撞判定點)，而不是錨在圖片底部(腳下方)
        const footPad = Math.round(a.h * (a.bpad || 0));
        // 只在變化時寫入；座標保留小數（整數化會讓移動跳格卡卡）
        const left = a.x - w / 2, top = a.y - a.h + footPad, z = 2 + Math.round(a.y) + _actorZBias(a);
        if (a._left !== left) { a.el.style.left = left + 'px'; a._left = left; }
        if (a._top !== top) { a.el.style.top = top + 'px'; a._top = top; }
        if (a._z !== z) { a.el.style.zIndex = String(z); a._z = z; }
        if (a._walking !== !!a.walking) { a.el.classList.toggle('walking', !!a.walking); a._walking = !!a.walking; }
        if (a._flipC !== !!a.flip) { a.el.classList.toggle('flip', !!a.flip); a._flipC = !!a.flip; }
    }

    // 走路圖角色：尺寸/幀切換全走 background-position（幀序 0,1,2,1 循環、立定=中幀）
    //   定位走 transform 不走 left/top——left/top 逐幀寫入會反覆弄髒版面樹，桌機聊天 DOM 肥時走路掉幀。
    //   走路圖角色沒有 CSS transform 動畫（.lstage-sheet 的 walking/flip 都關掉了），inline transform 不會打架；
    //   單張立姿角色(placeActor)的彈跳/翻面 keyframes 吃 transform，所以維持 left/top 別搬。
    function placeSheetActor(a) {
        const ratio = (a.frameW && a.frameH) ? a.frameW / a.frameH : 0.8;
        const w = a.h * ratio;
        if (a.wfrac != null) a.hw = Math.max(6, Math.round(a.baseH * (CFG.points.actorScale || 1) * ratio * a.wfrac));   // 同 placeActor:邏輯尺寸算腳印半寬
        const left = a.x - w / 2, top = a.y - a.h, z = 2 + Math.round(a.y) + _actorZBias(a);
        const tf = 'translate3d(' + left + 'px,' + top + 'px,0)';
        if (a._tf !== tf) { a.el.style.transform = tf; a._tf = tf; }
        if (a._z !== z) { a.el.style.zIndex = String(z); a._z = z; }
        if (a._sizedH !== a.h || a._sizedW !== w) {
            a.el.style.width = w + 'px';
            a.el.style.height = a.h + 'px';
            a.el.style.backgroundSize = (w * 3) + 'px ' + (a.h * 4) + 'px';
            a._sizedH = a.h; a._sizedW = w;
        }
        const bg = (-(a.frame || 0) * w) + 'px ' + (-(a.dir || 0) * a.h) + 'px';
        if (a._bg !== bg) { a.el.style.backgroundPosition = bg; a._bg = bg; }
    }

    // ── 👗 裝扮室（每角色外觀：單圖或3×4走路圖，右鍵角色進入）──
    const SKIN_KEY = 'lobby_stage_skins_v1';
    function _skins() {
        try { return JSON.parse(localStorage.getItem(SKIN_KEY) || '{}'); } catch (e) { return {}; }
    }
    function _saveSkin(key, skin) {
        try {
            const all = _skins();
            if (skin) all[key] = skin; else delete all[key];
            localStorage.setItem(SKIN_KEY, JSON.stringify(all));
        } catch (e) {}
    }
    // 換裝：把角色元素整顆換掉（img↔div 走路圖兩種形態）
    function _swapActorSrc(a, src) {
        const isSheet = (typeof src === 'object' && src && src.sheet);
        const el = document.createElement(isSheet ? 'div' : 'img');
        el.className = 'lstage-actor' + (isSheet ? ' lstage-sheet' : '') + ' lstage-loading';   // 換好的圖載入才顯示
        a.sheet = isSheet; a.dir = 0; a.frame = 1; a.animT = 0;
        a.frameW = a.frameH = null;
        a._left = a._top = a._z = a._bg = a._tf = null; a._sizedH = a._sizedW = null; a._walking = a._flipC = null;
        a.bpad = a.wfrac = a.hw = null;   // 換新圖→清掉舊的量測值，重新量
        if (isSheet) {
            const probe = new Image();
            if (!String(src.sheet).startsWith('data:')) probe.crossOrigin = 'anonymous';   // 要讀alpha量實寬
            probe.onload = () => {
                a.frameW = probe.naturalWidth / 3; a.frameH = probe.naturalHeight / 4;
                el.style.backgroundImage = 'url("' + src.sheet + '")';   // 🚨 CORS探針先載、bg再吃快取；反序會污染快取讀不到alpha
                _measureSheetBounds(a, probe);
                placeActor(a); a.el.classList.remove('lstage-loading');
            };
            probe.src = src.sheet;
        } else {
            if (!String(src).startsWith('data:')) el.crossOrigin = 'anonymous';
            el.src = src;
            el.style.height = a.h + 'px';
            el.addEventListener('load', () => { placeActor(a); _measureActorBounds(a); a.el.classList.remove('lstage-loading'); }, { once: true });
        }
        a.el.replaceWith(el);
        a.el = el;
        a._skinPending = false;
        placeActor(a);
    }
    async function _applySkin(a, key) {
        const skin = _skins()[key];
        if (!skin) return;
        const src = await resolveRef(skin.ref);
        if (!src || !a.el || !S.active) {   // 皮膚換不成→把先藏起來的預設圖還原顯示，別讓角色隱形
            if (a) a._skinPending = false;
            if (a && a.el) a.el.classList.remove('lstage-loading');
            return;
        }
        // ⚠️ 皮膚只管大廳小人外觀，不碰 a.portrait——對話立繪另有來源(固定NPC自帶/訪客avatar_cache頭像/裝扮室「生成立繪」的sprite_cache)，兩者是不同東西(Rae定案 2026-07-17)
        //   舊 skin 可能殘留 asPortrait 旗標(已退役)，一律忽略。
        _swapActorSrc(a, skin.kind === 'sheet' ? { sheet: src } : src);
    }

    // 👗 右鍵角色選單/裝扮室/對話紀錄窗/內建生成 → 拆到 lobby_dress.js（走 _b 橋；2026-07-16）

    // ── 玩家 ─────────────────────────────────────────────
    const PLAYER_H = 190, PLAYER_SPEED = 0.33;
    const WALK_FRAMES = [0, 1, 2, 1], WALK_FRAME_MS = 150;
    function initPlayer() {
        // 單張立姿+彈跳翻面（Rae定案：多角色出走路圖太累沒必要）；要走路圖時改傳 {sheet: ASSET.walkBase}
        const src = (localStorage.getItem('lobby_stage_mc') === 'm') ? ASSET.mcM : ASSET.mcF;
        // 'arrive'=走門進場（落點可在擺設模式拖橘色門圓點調整）；落點在牆裡自動彈到最近地板
        const raw = (S.spawnOverride === 'arrive' ? (CFG.points.arrive || CFG.points.player)
                  : S.spawnOverride) || CFG.points.player;
        S.spawnOverride = null;
        const sp = findFreeSpot(raw.x, raw.y);
        S.player = Object.assign(spawnActor(src, sp.x, sp.y, PLAYER_H), { dest: null, key: 'player', name: '你', defaultSrc: src });
        if (_skins()['player']) S.player._skinPending = true;   // 玩家有自訂皮膚→預設圖先藏著(免閃)
        _applySkin(S.player, 'player');
        S.onKey = (e) => {
            const tag = (document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            const k = e.key.toLowerCase();
            // 🎮 對話快捷鍵：走近 NPC 按 E/F 開聊；對話中按 E/F/Esc 收起（省得每次點 ✖）。不做「移動自動關」避免誤觸。
            if (e.type === 'keydown' && (k === 'e' || k === 'f' || k === 'escape')) {
                if (S.talkTarget) { endTalk(); e.preventDefault(); e.stopPropagation(); return; }
                if (k !== 'escape' && S.player && !S.edit) {
                    let best = null, bestD = INTERACT_R;
                    for (const n of S.npcs) {
                        if (!n.hint) continue;
                        const d = Math.hypot(n.x - S.player.x, n.y - S.player.y);
                        if (d < bestD) { bestD = d; best = n; }
                    }
                    if (best) { if (best.onInteract) best.onInteract(best); else startTalk(best); e.preventDefault(); e.stopPropagation(); return; }
                }
            }
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
                S.keys[k] = (e.type === 'keydown');
                // 🚨 必須整條攔死：酒館本體綁了 ↑=編輯訊息、←→=swipe(會重新生成=燒API)
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            }
        };
        // 捕獲階段搶第一手，酒館的快捷鍵監聽器完全收不到
        window.addEventListener('keydown', S.onKey, true);
        window.addEventListener('keyup', S.onKey, true);
        S.root.querySelector('.lstage-click').addEventListener('click', (e) => {
            if (S.edit) return;
            if (_lpSuppressClick) { _lpSuppressClick = false; return; }   // 長按剛開過選單→吃掉這次 click
            if (S.talkTarget) { endTalk(); return; }
            hideDialog();   // 點空地=收起跟瀅瀅的對話框
            const r = S.world.getBoundingClientRect();
            S.player.dest = { x: (e.clientX - r.left) / S.scale, y: (e.clientY - r.top) / S.scale };
        });
        // 🔍 擺設模式滾輪縮放：放大精細擺家具、縮小看全景。掛在 S.root（祖層）→滑到物件上也收得到；unmount 移除防累積。
        S.onWheel = (e) => {
            if (!S.edit) return;
            if (e.target.closest('.lstage-layers-win, .lstage-edit-panel')) return;   // 圖層小窗/控制面板內的滾輪=捲它們自己的清單，別搶去縮放地圖
            e.preventDefault();
            const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            S.edit.zoom = Math.max(0.25, Math.min(6, (S.edit.zoom || 1) * f));   // 可縮到 0.25(地圖變小、四周留白好拖) ~ 6(放大看細節)
            fitCamera();
        };
        S.root.addEventListener('wheel', S.onWheel, { passive: false });
    }

    // ── NPC ──────────────────────────────────────────────
    const NPC_H = 180, INTERACT_R = 130;

    // 🧑‍🤝‍🧑 NPC 生成/名冊（愛麗絲/柴郡/瀅瀅駐點、SN名冊雷伊丹、日誌客人池＋訪客頭像掛載）→ 拆到 lobby_npcs.js（走 _b 橋；2026-07-16）
    function addNpc(cfg) {
        const a = spawnActor(cfg.src, cfg.x, cfg.y, cfg.h || NPC_H);
        const keepH = a.h;   // spawnActor 已套 actorScale，別讓 cfg.h(未縮放) 蓋回去
        const npc = Object.assign(a, cfg, { h: keepH, wanderT: 1500 + Math.random() * 3000, dest: null, defaultSrc: cfg.src });
        if (_skins()[cfg.key]) npc._skinPending = true;   // 有自訂皮膚→預設圖先藏著，等 _applySkin 換好才顯示(免閃)
        _applySkin(npc, cfg.key);
        const tag = document.createElement('div');
        tag.className = 'lstage-tag'; tag.textContent = cfg.name;
        S.world.appendChild(tag); npc.tag = tag;
        const hint = document.createElement('div');
        hint.className = 'lstage-hint'; hint.style.display = 'none';
        hint.innerHTML = '<i class="fa-solid fa-comment-dots"></i>';
        hint.addEventListener('click', (e) => { e.stopPropagation(); if (npc.onInteract) { npc.onInteract(npc); return; } startTalk(npc); });
        S.world.appendChild(hint); npc.hint = hint;
        S.npcs.push(npc);
        placeNpcExtras(npc);
        return npc;
    }
    function placeNpcExtras(npc) {
        const x = Math.round(npc.x), ty = Math.round(npc.y + 8), hy = Math.round(npc.y - npc.h - 6);
        if (npc._ex === x && npc._ety === ty) return;   // 沒移動就不碰 DOM
        npc._ex = x; npc._ety = ty;
        npc.tag.style.left = x + 'px';
        npc.tag.style.top = ty + 'px';
        npc.hint.style.left = x + 'px';
        npc.hint.style.top = hy + 'px';
    }
    function updateNpcs(dt) {
        S.npcs.forEach(n => {
            if (n._theaterFrozen) return;   // 🎭 小劇場：凍結當事 NPC 的漫步/跟隨/面向，維持面對面
            if (n.facePlayer && S.player) {   // 愛麗絲永遠面向玩家
                if (n.sheet) n.dir = S.player.x < n.x ? 1 : 2;
                else n.flip = S.player.x > n.x;   // 原圖朝左：玩家在右側才鏡像成朝右
            }
            if (n.follow && S.player && S.talkTarget !== n) {   // 跟隨優先於 noWander/漫步（客人本是站定，跟隨要能蓋過）；對話中先停不跟
                const FOLLOW_GAP = 60;
                // 串成一列：隊首跟玩家、其餘各跟前一個→彼此保持 GAP 不重疊（多角色跟隨）
                const fi = S.followers.indexOf(n);
                const lead = fi > 0 ? S.followers[fi - 1] : S.player;
                const vx = lead.x - n.x, vy = lead.y - n.y, d = Math.hypot(vx, vy);
                if (d > FOLLOW_GAP) {
                    const step = Math.min(d - FOLLOW_GAP, 0.34 * dt);   // 略快於漫步以跟上玩家、又不衝過頭
                    const nx = n.x + vx / d * step, ny = n.y + vy / d * step;
                    if (!(n.avoidBlocks && blockedPath(n.x, n.y, nx, ny, n.hw))) {
                        n.x = nx; n.y = ny; n.walking = true;
                        if (n.sheet) {
                            n.dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0);
                            n.animT = (n.animT || 0) + dt;
                            n.frame = WALK_FRAMES[Math.floor(n.animT / WALK_FRAME_MS) % WALK_FRAMES.length];
                        } else if (vx) n.flip = vx > 0;   // 原圖朝左：往右走才鏡像
                    }
                } else { n.walking = false; if (n.sheet) { n.frame = 1; n.animT = 0; } }
                n.dest = null;
                placeActor(n); placeNpcExtras(n); _npcNearCheck(n);
                return;
            }
            if (S.talkTarget === n) {   // 💬 對話中：轉頭面向玩家（RPG 感）；走路圖設 dir、單張設 flip
                n.walking = false;
                if (S.player) {
                    const vx = S.player.x - n.x, vy = S.player.y - n.y;
                    if (n.sheet) { n.dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0); n.frame = 1; n.animT = 0; }
                    else if (vx) n.flip = vx > 0;   // 原圖朝左：玩家在右才鏡像
                }
                placeActor(n); placeNpcExtras(n); _npcNearCheck(n); return;
            }
            if (n.noWander) { n.walking = false; placeActor(n); placeNpcExtras(n); _npcNearCheck(n); return; }
            n.wanderT -= dt;
            if (n.wanderT <= 0 && !n.dest) {
                const R = n.homeRect;
                n.dest = { x: R.x + Math.random() * R.w, y: R.y + Math.random() * R.h };
                n.wanderT = 2500 + Math.random() * 5000;
            }
            if (n.dest) {
                const vx = n.dest.x - n.x, vy = n.dest.y - n.y, d = Math.hypot(vx, vy);
                if (d < 5) { n.dest = null; n.walking = false; if (n.sheet) { n.frame = 1; n.animT = 0; } }
                else {
                    const step = 0.12 * dt;
                    const nx = n.x + vx / d * step, ny = n.y + vy / d * step;
                    if (n.avoidBlocks && blockedPath(n.x, n.y, nx, ny, n.hw)) { n.dest = null; n.walking = false; if (n.sheet) { n.frame = 1; n.animT = 0; } }
                    else {
                        n.x = nx; n.y = ny;
                        n.walking = true;
                        if (n.sheet) {   // 有走路圖的NPC走真幀動畫
                            n.dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0);
                            n.animT = (n.animT || 0) + dt;
                            n.frame = WALK_FRAMES[Math.floor(n.animT / WALK_FRAME_MS) % WALK_FRAMES.length];
                        } else if (vx) n.flip = vx > 0;   // 原圖朝左：往右走才鏡像
                    }
                }
            }
            placeActor(n); placeNpcExtras(n);
            _npcNearCheck(n);
        });
    }
    function _npcNearCheck(n) {
        const near = S.player && Math.hypot(n.x - S.player.x, n.y - S.player.y) < INTERACT_R;
        n.hint.style.display = (near && !S.talkTarget) ? '' : 'none';
    }

    // ── NPC 各自的輕量對話歷史（localStorage，上限 40 條）──
    //   cap 提到 40：給一對一記憶壓縮留 headroom（累積到閾值才壓，壓縮失敗時不會立刻擠掉未總結的舊訊息）
    function getNpcHistory(key) {
        try { return JSON.parse(localStorage.getItem('lstage_hist_' + key) || '[]'); } catch (e) { return []; }
    }
    function pushNpcHistory(key, msg) {
        try {
            const arr = getNpcHistory(key);
            arr.push(msg);
            while (arr.length > 40) arr.shift();
            localStorage.setItem('lstage_hist_' + key, JSON.stringify(arr));
        } catch (e) {}
    }
    // 覆寫整條歷史（歷史窗編輯/刪除/回退用）
    function setNpcHistory(key, arr) {
        try { localStorage.setItem('lstage_hist_' + key, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch (e) {}
    }
    // 壓縮後裁短：只留最近 keepLast 條，回傳被裁掉的舊訊息（供組 chunk）
    function truncateNpcHistory(key, keepLast) {
        try {
            const arr = getNpcHistory(key);
            if (arr.length <= keepLast) return [];
            const dropped = arr.slice(0, arr.length - keepLast);
            localStorage.setItem('lstage_hist_' + key, JSON.stringify(arr.slice(-keepLast)));
            return dropped;
        } catch (e) { return []; }
    }
    function popNpcHistoryTail(key, role) {
        try {
            const arr = getNpcHistory(key);
            if (arr.length && arr[arr.length - 1].role === role) {
                arr.pop();
                localStorage.setItem('lstage_hist_' + key, JSON.stringify(arr));
            }
        } catch (e) {}
    }

    // ── 對話框顯隱＋像素立繪（VN風：平常收起、對話才浮出）──
    function showDialog() {
        const left = document.querySelector('.lobby-left');
        if (!left || !S.active) return;
        left.classList.remove('lstage-dlg-hidden');
        // 立繪=說話對象的像素小人放大版（NPC=對方、跟瀅瀅聊=瀅瀅）
        let p = left.querySelector('.lstage-talk-portrait');
        if (!p) {
            p = document.createElement('img');
            p.className = 'lstage-talk-portrait';
            left.appendChild(p);
        }
        // 走路圖角色的el是div沒有src → 立繪用 portrait 欄位或退回預設字串圖。最終保底=中性剪影(非瀅瀅)。
        const t = S.talkTarget;
        p.src = t ? (t.portrait || t.el.src || (typeof t.defaultSrc === 'string' ? t.defaultSrc : ASSET.mcM))
              : (S.scene === 'hall' ? ASSET.alice : (S.scene === 'room404' ? ASSET.cheshire : ASSET.ying));
        // 擺放種類：guest 從 avatar_cache 撈到的是「頭像(半身)」→ 浮框；其餘(名冊手繪立繪/剪影/走路圖)= 立繪(貼底)。
        //   portraitKind='avatar' 只在 lobby_npcs.js 掛訪客頭像成功設 portrait 時標；portrait 是 || 第一順位，標了顯示的就是它。
        p.classList.toggle('is-avatar', !!(t && t.portraitKind === 'avatar' && t.portrait));
        // ✖ 關閉鈕（掛在對話框右上角；點空地也能關，這顆是給直覺用的）
        const box = document.getElementById('iris-dialogue-box');
        if (box && !box.querySelector('.lstage-dlg-close')) {
            const btn = document.createElement('button');
            btn.className = 'lstage-dlg-close';
            btn.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i> 離開';
            btn.addEventListener('click', (e) => { e.stopPropagation(); if (S.talkTarget) endTalk(); else hideDialog(); });
            box.appendChild(btn);
        }
    }
    function hideDialog() {
        const left = document.querySelector('.lobby-left');
        if (!left) return;
        left.classList.add('lstage-dlg-hidden');
        left.querySelector('.lstage-talk-portrait')?.remove();
        document.querySelector('#iris-dialogue-box .lstage-dlg-close')?.remove();
        // 戳戳反應框一起收：開聊招呼走反應框（不受 lstage-dlg-hidden 管，漫遊戳戳要能冒泡）
        // → 按 ✖ 關對話時它會自己留到計時器到期（最長15s）＝「背景關不掉」。這裡直接收掉。
        const rb = document.getElementById('iris-reaction-box');
        if (rb) rb.style.display = 'none';
    }

    // ── 對話目標（對話本體仍走 void_terminal.sendIrisMessage）──
    function startTalk(npc) {
        if (S.edit) return;
        if (S.theater && (npc === S.theater.a || npc === S.theater.b)) window.LobbyTheater?.end();   // 🎭 跟配對當事人開聊→收掉配對（清泡泡+解凍）免凍結卡死；跟旁人聊不打斷等待中的小劇場
        S.talkTarget = npc;
        S.npcs.forEach(n => { n.hint.style.display = 'none'; });
        const tagSpan = document.querySelector('#iris-name-tag span');
        const input = document.getElementById('iris-input');
        if (npc.key === 'ying' || npc.key === 'cheshire') {
            // 瀅瀅/柴郡=對話目標，但管線走各自原生軌道（void_terminal 對這兩位不走 NPC 分支）
            if (tagSpan) tagSpan.textContent = npc.name;
            if (input) input.placeholder = '和' + npc.name + '聊聊…（點空地結束）';
            showDialog();
            window.dispatchEvent(new CustomEvent('lstage-poke-ying'));   // 開聊招呼=戳戳池抽一句(404房自動用柴郡池)
            return;
        }
        if (tagSpan) tagSpan.textContent = npc.name;
        if (input) input.placeholder = '和' + npc.name + '聊聊…（點空地結束）';
        showDialog();
        window.VoidTerminal?.primeStageDialog?.(npc);   // 清掉殘留(瀅瀅預設/上一位)、改顯示這位自己的最後一句
        if (npc.key === 'rabbit') { try { window.OS_PT?.openExchange?.(); } catch (e) {} }   // 白兔：對話時右側浮出買房面板
    }
    function endTalk() {
        if (!S.talkTarget) return;
        const t = S.talkTarget;
        S.talkTarget = null;
        // 對話結束→NPC 轉回正面（朝下）；facePlayer 的(愛麗絲)下一幀會自己再面向玩家，不影響
        if (t) {
            if (t.sheet) { t.dir = 0; t.frame = 1; t.animT = 0; } else { t.flip = false; }
            if (t.el) placeActor(t);
        }
        _applySceneHeader();
        hideDialog();
        try { window.OS_PT?.closeExchange?.(); } catch (e) {}   // 離開白兔→收起買房面板
    }
    // 場景預設門面：書咖=瀅瀅、大廳=愛麗絲、404=柴郡（場景牌/名牌/輸入框提示跟著場景走）
    const SCENE_HEADER = {
        cafe:    { name: '瀅瀅',   badge: '視差書咖', ph: '提供故事素材或與瀅瀅對話...' },
        hall:    { name: '愛麗絲', badge: '純白大廳', ph: '與愛麗絲對話，或走向大門出去街區...' },
        room404: { name: '柴郡',   badge: '404號房',  ph: '對404號房的看守者說話，或走底部出口離開...' },
        city:    { name: '街區',   badge: '視差城市', ph: '在街區走走、點路人聊聊，或走進書咖／純白大廳...' },
        exchange:{ name: '白兔先生', badge: '交易所', ph: '走近白兔先生，兌換屬於你的一席之地...' },
    };
    function _applySceneHeader() {
        const H = SCENE_HEADER[S.scene] || SCENE_HEADER.cafe;
        const tagSpan = document.querySelector('#iris-name-tag span');
        if (tagSpan) tagSpan.textContent = H.name;
        if (window.VoidTerminal?._bridge?.setSceneBadge) window.VoidTerminal._bridge.setSceneBadge(H.badge);
        const input = document.getElementById('iris-input');
        if (input) input.placeholder = H.ph;
    }
    // 場景預設對話對象：大廳裡沒點人直接打字＝跟愛麗絲說話（書咖=null→走瀅瀅原軌道）
    function getDefaultTarget() {
        return S.scene === 'hall' ? (S.npcs.find(n => n.key === 'alice') || null) : null;
    }

    // ── 鏡頭 ─────────────────────────────────────────────
    // 容器尺寸只在 fitCamera 讀（resize/ResizeObserver 觸發），RAF 內用快取——
    // 每幀讀 clientWidth 是強制同步重排點，桌機聊天 DOM 肥時整條重排被拖著跑=走路卡卡的主因。
    function fitCamera() {
        if (!S.root) return;
        const vw = S.root.clientWidth, vh = S.root.clientHeight;
        if (!vw || !vh) return;
        S._vw = vw; S._vh = vh;
        // 建構模式：contain*0.9(留黑邊好抓邊角)；靜態點擊地圖：contain(整張置中看完)；一般遊玩：cover 填滿螢幕跟人跑
        const SC = SCENES[S.scene];
        S.scale = S.edit ? Math.min(vw / MAP_W, vh / MAP_H) * 0.9 * (S.edit.zoom || 1)   // 擺設模式：滾輪縮放(zoom≥1 放大看細節)
            : (SC && SC.staticMap) ? Math.min(vw / MAP_W, vh / MAP_H)
            : Math.max(vw / MAP_W, vh / MAP_H);
        S._camX = S._camY = null;   // 縮放變了→強制重寫 transform（applyCamera 有快取）
        applyCamera();
        // 🗺️ 地圖場景小人跟鏡頭脫鉤：cover 縮放一變(resize/旋轉/全屏)就把固定螢幕尺寸重算一次
        if (SCENES[S.scene] && SCENES[S.scene].outdoor) applyActorScale();
    }
    function applyCamera() {
        if (!S.root) return;
        const vw = S._vw, vh = S._vh;
        if (!vw || !vh) return;
        const focus = S.edit ? S.edit.cam : (S.player ? { x: S.player.x, y: S.player.y } : { x: MAP_W / 2, y: MAP_H / 2 });
        // 底部對話框會蓋住下緣 → 跟隨模式把焦點擺在畫面偏上(38%)，人不會躲進對話框後面
        const focusRatio = S.edit ? 0.5 : 0.38;
        let cx = focus.x * S.scale - vw / 2, cy = focus.y * S.scale - vh * focusRatio;
        const rangeX = MAP_W * S.scale - vw, rangeY = MAP_H * S.scale - vh;
        if (SCENES[S.scene] && SCENES[S.scene].staticMap) {
            cx = rangeX / 2; cy = rangeY / 2;   // 靜態地圖：整張置中（contain 時 range 為負→自動 letterbox 置中）
        } else if (S.edit) {
            // 建構模式：允許超出邊界平移（看到外圈黑邊、把被面板擋住的角落拖出來）
            const overX = vw * 1.2, overY = vh * 1.2;
            cx = Math.max(Math.min(0, rangeX) - overX, Math.min(Math.max(0, rangeX) + overX, cx));
            cy = Math.max(Math.min(0, rangeY) - overY, Math.min(Math.max(0, rangeY) + overY, cy));
        } else {
            cx = Math.max(0, Math.min(rangeX, cx));
            cy = Math.max(0, Math.min(rangeY, cy));
        }
        if (S._camX === cx && S._camY === cy) return;   // 鏡頭沒動就不重寫 transform
        S._camX = cx; S._camY = cy;
        S.world.style.transform = 'translate(' + (-cx) + 'px,' + (-cy) + 'px) scale(' + S.scale + ')';
    }

    // 舞台看不見就別燒 CPU：VN 劇情/閱讀器全螢幕蓋著、大廳分頁被切走、瀏覽器分頁背景化
    // → 60fps 迴圈降成每 500ms 探一次「能醒了嗎」，不跟 VN 的打字機/生圖/語音搶主執行緒。
    function _stageHidden() {
        try {
            if (document.hidden) return true;
            if (!S.root || !S.root.isConnected) return true;
            if (S.root.offsetParent === null) return true;   // 大廳分頁 display:none（切去其他 tab）
            const vn = document.getElementById('aurelia-vn-panel');
            if (vn && vn.offsetParent !== null) return true;   // VN 劇情面板開著（全螢幕蓋住舞台）
            const rd = document.getElementById('vn-reader-sa');
            if (rd && rd.offsetParent !== null) return true;   // VN 閱讀器同理
        } catch (e) {}
        return false;
    }
    // ── 🌦 天氣層：小雨/小雪 ──────────────────────────────
    //    一張 canvas 蓋在場景上(螢幕座標)+百來顆粒子+共用主 tick(不另開迴圈;台面藏起來時 tick 睡=天氣自動停)。
    //    只在 outdoor 場景下；擺設模式收掉(別干擾編輯)。
    //    模式存 localStorage lobby_weather_v1：auto(進場擲骰 晴50/雨25/雪25)/clear/rain/snow；大廳設置可選。
    let _wx = null;         // { cv, ctx, w, h, drops, mode }
    let _wxSetting = null;  // 設定快取（設置窗改的時候直接改這個,免得每幀讀 localStorage）
    function _weatherMode() {
        if (_wxSetting == null) { try { _wxSetting = localStorage.getItem('lobby_weather_v1') || 'auto'; } catch (e) { _wxSetting = 'auto'; } }
        if (_wxSetting !== 'auto') return _wxSetting;
        if (S._wxRoll == null) S._wxRoll = Math.random();   // 進場擲一次(unmount 清)
        return S._wxRoll < 0.5 ? 'clear' : S._wxRoll < 0.75 ? 'rain' : 'snow';
    }
    function _wxDrop(mode, w, h, anywhere) {
        if (mode === 'snow') return {
            x: Math.random() * (w + 60) - 30,
            y: anywhere ? Math.random() * h : -12 - Math.random() * 30,
            r: 1 + Math.random() * 1.6,           // 雪片半徑
            spd: 0.05 + Math.random() * 0.07,     // 慢飄
            phase: Math.random() * 1000,          // 左右搖擺相位
        };
        return {
            x: Math.random() * (w + 80) - 40,
            y: anywhere ? Math.random() * h : -30 - Math.random() * 40,
            len: 9 + Math.random() * 8,          // 雨絲長
            spd: 0.5 + Math.random() * 0.35,     // px/ms
            drift: 0.05 + Math.random() * 0.05,  // 微斜
        };
    }
    function _weatherTick(dt) {
        const mode = (S.active && !S.edit && SCENES[S.scene] && SCENES[S.scene].outdoor) ? _weatherMode() : 'clear';
        if (mode === 'clear') { if (_wx) { _wx.cv.remove(); _wx = null; } return; }
        if (_wx && _wx.mode !== mode) { _wx.cv.remove(); _wx = null; }   // 換天氣→重鋪
        if (!_wx) {
            const cv = document.createElement('canvas');
            cv.className = 'lstage-weather ' + mode;   // rain=陰天暗罩 / snow=雪天冷霧,見 CSS
            S.root.appendChild(cv);
            _wx = { cv, ctx: cv.getContext('2d'), w: 0, h: 0, drops: [], mode };
        }
        const rc = S.root.getBoundingClientRect();
        const w = Math.max(1, Math.round(rc.width)), h = Math.max(1, Math.round(rc.height));
        if (_wx.w !== w || _wx.h !== h) {   // 尺寸變了(轉向/縮放)→重鋪畫布+按面積配密度(封頂:雨150/雪120)
            _wx.w = _wx.cv.width = w; _wx.h = _wx.cv.height = h;
            const n = mode === 'snow' ? Math.min(120, Math.round(w * h / 11000)) : Math.min(150, Math.round(w * h / 9000));
            _wx.drops = Array.from({ length: n }, () => _wxDrop(mode, w, h, true));
        }
        const { ctx, drops } = _wx;
        ctx.clearRect(0, 0, w, h);
        if (mode === 'rain') {
            ctx.strokeStyle = 'rgba(205,222,255,.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const d of drops) {
                d.y += d.spd * dt; d.x += d.drift * dt;
                if (d.y > h + 20) Object.assign(d, _wxDrop('rain', w, h, false));
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - d.drift * 22, d.y - d.len);
            }
            ctx.stroke();
        } else {   // snow：白點慢飄+左右搖擺
            ctx.fillStyle = 'rgba(255,255,255,.8)';
            for (const d of drops) {
                d.y += d.spd * dt;
                d.x += Math.sin((d.y + d.phase) / 42) * 0.028 * dt;
                if (d.y > h + 8) Object.assign(d, _wxDrop('snow', w, h, false));
                ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill();
            }
        }
    }
    function tick(now) {
        if (_stageHidden()) {
            S.raf = null;
            S.sleepT = setTimeout(() => {
                if (!S.active) return;
                S.last = performance.now();
                S.raf = requestAnimationFrame(tick);
            }, 500);
            return;
        }
        const dt = Math.min(50, now - S.last); S.last = now;
        update(dt);
        _weatherTick(dt);
        S.raf = requestAnimationFrame(tick);
    }
    function update(dt) {
        if (S.edit) { applyCamera(); return; }   // 擺設模式凍結移動/漫步
        const p = S.player;
        if (p && !S.talkTarget && !S.transitioning) {   // 過場期間凍結移動（防搖桿殘留方向在換場瞬間繼續推）
            let dx = 0, dy = 0;
            if (S.keys['arrowleft'] || S.keys['a']) dx -= 1;
            if (S.keys['arrowright'] || S.keys['d']) dx += 1;
            if (S.keys['arrowup'] || S.keys['w']) dy -= 1;
            if (S.keys['arrowdown'] || S.keys['s']) dy += 1;
            if (S.joy && (S.joy.x || S.joy.y)) { dx = S.joy.x; dy = S.joy.y; }   // 🕹️ 虛擬搖桿（手機）：方向覆蓋鍵盤/點擊
            if (dx || dy) p.dest = null;
            else if (p.dest) {
                const vx = p.dest.x - p.x, vy = p.dest.y - p.y, d = Math.hypot(vx, vy);
                if (d < 6) p.dest = null; else { dx = vx / d; dy = vy / d; }
            }
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                // 🧈 牆滑+轉角助推：被擋自動沿牆/繞角滑（朝目的地分量恆正→點擊移動不會繞圈）；完全頂死平牆才停
                if (!_slideMove(p, dx / len, dy / len, PLAYER_SPEED * dt)) p.dest = null;
                p.walking = true;
                if (p.sheet) {
                    // 方向列：0下/1左/2右/3上（主軸決定朝向），幀序 0,1,2,1
                    p.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
                    p.animT = (p.animT || 0) + dt;
                    p.frame = WALK_FRAMES[Math.floor(p.animT / WALK_FRAME_MS) % WALK_FRAMES.length];
                } else if (dx !== 0) p.flip = dx > 0;   // 原圖朝左：往右走才鏡像
            } else {
                p.walking = false;
                if (p.sheet) { p.frame = 1; p.animT = 0; }   // 立定=中幀
            }
            placeActor(p);
            _updateSeeThrough();   // 👻 被建築蓋住→開圓形透視窗
            // 🚪 過門判定：落地後必須先「走出」觸發區一次，門才重新武裝（防落點在門區內乒乓轉場）
            if (!S.transitioning) {
                const door = CFG.doors.find(D =>
                    p.x > D.x && p.x < D.x + D.w && p.y > D.y && p.y < D.y + D.h);
                if (door) {
                    if (S.doorArm && performance.now() > S.doorCd) {
                        if (door.restore) {   // 404出口：走系統還原流程(void_terminal 收事件跑 restoreLobby)
                            S.doorArm = false;
                            S.doorCd = performance.now() + 2000;
                            window.dispatchEvent(new CustomEvent('lstage-restore-lobby'));
                        } else if (door.panel) {   // 面板型門（交易所…）：彈面板、不切場景；踏出後才重新武裝
                            S.doorArm = false;
                            S.doorCd = performance.now() + 1500;
                            window.dispatchEvent(new CustomEvent('lstage-open-' + door.panel));
                        } else goScene(door.to, door.spawn);
                    }
                } else S.doorArm = true;
            }
        }
        updateNpcs(dt);
        applyCamera();
    }

    // ── 🚪 場景切換（白光過場）──────────────────────────
    function goScene(to, spawn, spawnMode) {
        if (S.transitioning || !SCENES[to]) return;
        S.transitioning = true;
        const left = document.querySelector('.lobby-left');
        const fade = document.createElement('div');
        fade.className = 'lstage-fade';
        (left || S.root).appendChild(fade);
        requestAnimationFrame(() => fade.classList.add('on'));
        setTimeout(() => {
            unmount();
            S.scene = to;
            // 門帶 spawn={x,y} 就落在指定點（每扇門各自的門口）；沒帶才用目標場景的「落」圓點
            S.spawnOverride = spawn || ((spawnMode === 'player') ? null : 'arrive');
            S.doorCd = performance.now() + 900;   // 落地冷卻，防止秒回
            tryMount();
            S.transitioning = false;
            fade.classList.remove('on');
            setTimeout(() => fade.remove(), 400);
        }, 320);
    }
    // 404 進出（void_terminal 的 enter404Room/restoreLobby 呼叫；stage 關著時只記場景）
    function enter404Stage() {
        if (S.active) goScene('room404', null, 'arrive');
        else S.scene = 'room404';
    }
    function exit404Stage() {
        if (S.active) goScene('cafe', null, 'player');
        else { S.scene = 'cafe'; tryMount(); }
    }

    // 🕹️ 手機虛擬搖桿：左下角圓盤拖動→餵 S.joy 方向向量（給 update 當 dx/dy）。只在觸控裝置建立。
    function _setupJoystick(root) {
        try { if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return; } catch (e) { return; }
        const base = document.createElement('div');
        base.className = 'lstage-joy';
        const knob = document.createElement('div');
        knob.className = 'lstage-joy-knob';
        base.appendChild(knob);
        root.appendChild(base);
        const R = 46, DEAD = 8;   // R=拉桿半徑；DEAD=死區(px)
        let active = false, cx = 0, cy = 0;
        const setKnob = (x, y) => { knob.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
        const onDown = (e) => {
            active = true;
            try { base.setPointerCapture(e.pointerId); } catch (_) {}
            const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
            onMove(e);
        };
        const onMove = (e) => {
            if (!active || !base.isConnected) return;   // 換場銷毀舊搖桿後，殘留 capture 的 move 別再寫 S.joy（防換場後卡方向飄移）
            let dx = e.clientX - cx, dy = e.clientY - cy;
            const d = Math.hypot(dx, dy);
            if (d > R) { dx = dx / d * R; dy = dy / d * R; }
            setKnob(dx, dy);
            S.joy = (Math.hypot(dx, dy) < DEAD) ? null : { x: dx / R, y: dy / R };
            e.preventDefault();
        };
        const onUp = () => { active = false; S.joy = null; setKnob(0, 0); };
        base.addEventListener('pointerdown', onDown);
        base.addEventListener('pointermove', onMove);
        base.addEventListener('pointerup', onUp);
        base.addEventListener('pointercancel', onUp);
    }

    // ── 🗺 快轉小地圖（🏙 鈕）：廣場俯瞰縮圖＝點哪傳哪；點建築＝直接進室內/落它門口；下排快捷區 ──
    function _openCityMap() {
        _closeWins();
        const K = 0.2;   // 縮圖比例（1536×1024 → 307×205）
        const isNight = _sceneIsNight(SCENES.city);
        // 城市佈局跨場景讀：存檔(layoutFull)優先,沒有用預設——當前 CFG 是本場景的,不能用
        let layout = SCENES.city.layout || [];
        try {
            const saved = JSON.parse(localStorage.getItem(SCENES.city.cfgKey) || 'null');
            if (saved && Array.isArray(saved.layoutFull) && saved.layoutFull.length) layout = saved.layoutFull;
        } catch (e) {}
        const box = document.createElement('div');
        box.className = 'lstage-citymap';
        box.innerHTML =
            '<div class="lcm-title"><i class="fa-solid fa-map-location-dot"></i> 快轉——點地圖上任何地方' +
              '<button class="lcm-close"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="lcm-map" style="width:' + Math.round(MAP_W * K) + 'px;height:' + Math.round(MAP_H * K) + 'px"></div>' +
            '<div class="lcm-chips">' +
              [['city', '廣場'], ['cafe', '書咖'], ['hall', '大廳'], ['exchange', '交易所'], ['room404', '404']]
                .map(c => '<button class="lcm-chip" data-go="' + c[0] + '"' + (S.scene === c[0] ? ' disabled' : '') + '>' + c[1] + '</button>').join('') +
            '</div>';
        const map = box.querySelector('.lcm-map');
        const df = (f) => (isNight && CITY_NIGHT[f]) ? CITY_NIGHT[f] : f;   // 日夜對照
        const put = (fileOrRef, x, y, w, z, flip) => {
            const im = document.createElement('img');
            im.className = 'lcm-obj';
            im.style.left = Math.round(x * K) + 'px';
            im.style.top = Math.round(y * K) + 'px';
            im.style.width = Math.round(w * K) + 'px';
            im.style.zIndex = String(z);
            if (flip) im.style.transform = 'scaleX(-1)';
            resolveRef(typeof fileOrRef === 'string' ? { file: fileOrRef } : fileOrRef).then(src => { if (src) im.src = src; });
            map.appendChild(im);
        };
        // 底板 + 前後牆框（跟真場景同一套圖與層級）
        put(df(SCENES.city.base), 0, 0, MAP_W, 1);
        (Array.isArray(SCENES.city.lower) ? SCENES.city.lower : (SCENES.city.lower ? [SCENES.city.lower] : [])).forEach(f => put(df(f), 0, 0, MAP_W, 2));
        (Array.isArray(SCENES.city.upper) ? SCENES.city.upper : (SCENES.city.upper ? [SCENES.city.upper] : [])).forEach(f => put(df(f), 0, 0, MAP_W, 4000));
        // 物件（地塊空↔房照真實狀態）
        layout.forEach(o => {
            if ((o.plot && !_plotOccupied(o.plot)) || (o.plotFrame && _plotOccupied(o.plotFrame))) return;
            const s = o.s || 1;
            const z = o.layer === 'floor' ? 1 : o.layer === 'back' ? 2 : 2 + Math.round(o.y + Math.round(o.h * s) + (o.zb || 0));
            const nf = isNight ? (o.nightFile || CITY_NIGHT[o.file]) : null;
            put(nf ? { file: nf } : o, o.x, o.y, o.w * s, z, o.flipX);
        });
        // 建築熱點：書咖/大廳=直接進室內；住宅=落到它門前
        const dests = [];
        layout.forEach(o => {
            const f = String(o.file || ''), s = o.s || 1;
            const front = { x: Math.round(o.x + o.w * s / 2), y: Math.round(o.y + o.h * s + 18) };
            if (/book_cafe/.test(f)) dests.push({ o, label: '書咖', go: () => goScene('cafe') });
            else if (/lobby_day/.test(f)) dests.push({ o, label: '大廳', go: () => goScene('hall') });
            else if (/player_house/.test(f) && (!o.plot || _plotOccupied(o.plot))) dests.push({ o, label: '我的家', go: () => goScene('city', front) });
            else if (/npc_house/.test(f) && (!o.plot || _plotOccupied(o.plot))) dests.push({ o, label: '鄰居家', go: () => goScene('city', front) });
        });
        dests.forEach(d => {
            const o = d.o, s = o.s || 1;
            const hs = document.createElement('button');
            hs.className = 'lcm-spot';
            hs.style.left = Math.round(o.x * K) + 'px';
            hs.style.top = Math.round(o.y * K) + 'px';
            hs.style.width = Math.round(o.w * s * K) + 'px';
            hs.style.height = Math.round(o.h * s * K) + 'px';
            hs.innerHTML = '<span>' + d.label + '</span>';
            hs.addEventListener('click', (e) => { e.stopPropagation(); box.remove(); d.go(); });
            map.appendChild(hs);
        });
        // 點空地＝傳送到該點（落點若在牆裡,掛載後的遮罩檢查會自動彈到最近可走處）
        map.addEventListener('click', (e) => {
            const r = map.getBoundingClientRect();
            const x = Math.round((e.clientX - r.left) / K), y = Math.round((e.clientY - r.top) / K);
            box.remove();
            goScene('city', { x, y });
        });
        box.querySelector('.lcm-close').addEventListener('click', () => box.remove());
        box.querySelectorAll('.lcm-chip').forEach(b => b.addEventListener('click', () => { box.remove(); goScene(b.dataset.go); }));
        S.root.appendChild(box);
        _regWin(() => box.remove());
    }

    // ── ⚙️ 大廳設置小面板（舞台上，仿裝扮室）──
    function _closeLobbySettings() { S.setEl?.remove(); S.setEl = null; }
    function _openLobbySettings() {
        _closeWins();
        const useLore = localStorage.getItem('lobby_worldview_use_lorebook') === '1';
        const seeStory = localStorage.getItem('lobby_npc_see_current_story') === '1';
        const box = document.createElement('div');
        box.className = 'lstage-dress lstage-settings';
        const P = window.OS_PROMPTS || {};
        // 第一層清單定義：名稱 / 副標 / FA 圖標 / load / save
        const EDITS = [
            { id:'iris',  name:'瀅瀅（店長）',    sub:'視差書咖駐店小說家', icon:'fa-book',           load:P.loadIris,    save:P.saveIris },
            { id:'chess', name:'柴郡（404）',     sub:'404 號房管理員',     icon:'fa-cat',            load:P.loadCheshire, save:P.saveCheshire },
            { id:'alice', name:'愛麗絲（導覽官）', sub:'純白大廳首席導覽',   icon:'fa-user-astronaut', load:P.loadAlice,   save:P.saveAlice },
            { id:'world', name:'奧瑞亞世界觀',    sub:'主世界觀補充設定',   icon:'fa-globe',          load:P.loadWorld,   save:P.saveWorld },
        ];

        function renderList() {
            box.innerHTML =
                '<div class="lsd-title"><i class="fa-solid fa-gear"></i> 大廳設置</div>' +
                '<div class="lset-section-label">人設 / 世界觀</div>' +
                '<div class="lset-list">' +
                EDITS.map(e =>
                    '<button class="lset-item" data-edit="' + e.id + '">' +
                      '<i class="fa-solid ' + e.icon + ' lset-item-ic"></i>' +
                      '<span class="lset-item-tx"><span class="lset-item-name">' + e.name + '</span>' +
                      '<span class="lset-item-sub">' + e.sub + '</span></span>' +
                      '<i class="fa-solid fa-chevron-right lset-item-arrow"></i>' +
                    '</button>').join('') +
                '</div>' +
                '<div class="lset-section-label">選項</div>' +
                '<label class="lset-row"><span class="lset-tx">讀取角色卡世界書</span>' +
                  '<input type="checkbox" class="lset-chk" data-k="lore"' + (useLore ? ' checked' : '') + '></label>' +
                '<div class="lset-hint">預設用大總結摘要的世界觀。勾選＝改讀角色卡的完整世界書（含角色之間的橫向關係，大總結不會寫）。</div>' +
                '<label class="lset-row"><span class="lset-tx">大廳 NPC 看你當前劇情</span>' +
                  '<input type="checkbox" class="lset-chk" data-k="story"' + (seeStory ? ' checked' : '') + '></label>' +
                '<div class="lset-hint">預設關（各書隔離）。勾選＝NPC 會知道你在別的故事裡的近況，可能跨書吐槽你 XD。</div>' +
                '<label class="lset-row"><span class="lset-tx">NPC 小劇場</span>' +
                  '<input type="checkbox" class="lset-chk" data-k="theater"' + (localStorage.getItem('lobby_theater_on') !== '0' ? ' checked' : '') + '></label>' +
                '<div class="lset-hint">兩個 NPC 偶爾會湊在一起聊天，點頭頂泡泡或右上「小劇場」可以偷聽。</div>' +
                '<div class="lset-row"><span class="lset-tx">出現頻率</span>' +
                  '<span class="ltheater-freq' + (localStorage.getItem('lobby_theater_on') === '0' ? ' off' : '') + '">' +
                    ['low:低','mid:中','high:高'].map(o => { const v=o.split(':')[0], t=o.split(':')[1]; const cur=localStorage.getItem('lobby_theater_freq')||'mid'; return '<button class="ltheater-freq-btn'+(cur===v?' on':'')+'" data-freq="'+v+'">'+t+'</button>'; }).join('') +
                  '</span></div>' +
                '<div class="lset-row"><span class="lset-tx">城市天氣</span>' +
                  '<span class="ltheater-freq">' +
                    ['auto:自動','clear:晴','rain:雨','snow:雪'].map(o => { const v=o.split(':')[0], t=o.split(':')[1]; const cur=localStorage.getItem('lobby_weather_v1')||'auto'; return '<button class="ltheater-freq-btn'+(cur===v?' on':'')+'" data-wx="'+v+'">'+t+'</button>'; }).join('') +
                  '</span></div>' +
                '<div class="lset-hint">只影響戶外大地圖。自動＝每次進城隨機（晴／雨／雪）。</div>' +
                '<button class="lep-btn lep-done" data-act="close"><i class="fa-solid fa-check"></i> 關閉</button>';
            box.querySelectorAll('.lset-chk').forEach(chk => chk.addEventListener('change', (e) => {
                const k = e.target.dataset.k;
                if (k === 'lore') {
                    try { localStorage.setItem('lobby_worldview_use_lorebook', e.target.checked ? '1' : '0'); } catch (_) {}
                    _closeLobbySettings();
                    unmount(); tryMount();
                } else if (k === 'story') {
                    try { localStorage.setItem('lobby_npc_see_current_story', e.target.checked ? '1' : '0'); } catch (_) {}
                } else if (k === 'theater') {
                    try { localStorage.setItem('lobby_theater_on', e.target.checked ? '1' : '0'); } catch (_) {}
                    const fr = box.querySelector('.ltheater-freq'); if (fr) fr.classList.toggle('off', !e.target.checked);
                }
            }));
            box.querySelectorAll('.ltheater-freq-btn[data-freq]').forEach(btn => btn.addEventListener('click', () => {
                try { localStorage.setItem('lobby_theater_freq', btn.dataset.freq); } catch (_) {}
                box.querySelectorAll('.ltheater-freq-btn[data-freq]').forEach(b => b.classList.toggle('on', b === btn));
            }));
            box.querySelectorAll('.ltheater-freq-btn[data-wx]').forEach(btn => btn.addEventListener('click', () => {
                try { localStorage.setItem('lobby_weather_v1', btn.dataset.wx); } catch (_) {}
                _wxSetting = btn.dataset.wx;   // 快取同步→下一幀立即生效
                S._wxRoll = null;              // 切回自動時重擲
                box.querySelectorAll('.ltheater-freq-btn[data-wx]').forEach(b => b.classList.toggle('on', b === btn));
            }));
            box.querySelectorAll('.lset-item').forEach(btn => btn.addEventListener('click', () => {
                const e = EDITS.find(x => x.id === btn.dataset.edit);
                if (e) renderEditor(e);
            }));
        }

        function renderEditor(e) {
            const cur = (e.load && e.load()) || '';
            box.innerHTML =
                '<div class="lsd-title lset-editor-title">' +
                  '<button class="lset-back" data-act="back"><i class="fa-solid fa-chevron-left"></i></button>' +
                  '<span><i class="fa-solid ' + e.icon + '"></i> ' + e.name + '</span>' +
                '</div>' +
                '<div class="lset-hint">' + e.sub + '。留空則不注入補充。</div>' +
                '<textarea class="lset-ta" placeholder="在這裡補充設定，會疊加在內建世界觀/人設之後..."></textarea>' +
                '<button class="lep-btn lep-done" data-act="save"><i class="fa-solid fa-floppy-disk"></i> 保存</button>';
            const ta = box.querySelector('.lset-ta');
            ta.value = cur;
            box.querySelector('[data-act="back"]').addEventListener('click', renderList);
            box.querySelector('[data-act="save"]').addEventListener('click', function () {
                if (e.save) e.save(ta.value);
                const btn = this;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> 已保存';
                btn.classList.add('lset-saved');
                setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 保存'; btn.classList.remove('lset-saved'); }, 1200);
            });
        }

        renderList();
        S.root.appendChild(box);
        S.setEl = box;
        box.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) _closeLobbySettings(); });
    }

    // 🍔 舞台全屏：漢堡隱藏 MAIN MENU（.lobby-right）→ 舞台吃滿；狀態存 localStorage
    function _applyMenuHidden() {
        let hidden = false;
        try { hidden = localStorage.getItem('lobby_stage_menu_hidden') === '1'; } catch (e) {}
        document.querySelector('.lobby-body')?.classList.toggle('stage-menu-hidden', hidden);
        document.querySelector('.lstage-menu-btn')?.classList.toggle('active', hidden);
    }

    // ── 掛載/卸載 ─────────────────────────────────────────
    function tryMount() {
        const left = document.querySelector('.lobby-left');
        if (!left || S.active || !isOn()) return;
        CFG = _loadCfg(); rebuildBlocks(); loadMask();
        const isStatic = !!SCENES[S.scene].staticMap;   // 🗺️ 靜態點擊地圖（大地圖）：不生小人/不走路/不碰撞
        const root = document.createElement('div');
        root.className = 'lstage-root';
        root.innerHTML = '<div class="lstage-world">' +
            '<img class="lstage-map" src="' + CDN + _sceneBase(SCENES[S.scene]) + '" width="' + MAP_W + '" height="' + MAP_H + '">' +
            '<div class="lstage-click"></div></div>' +
            '<button class="lstage-set-btn" title="大廳設置"><i class="fa-solid fa-gear"></i></button>' +
            '<button class="lstage-menu-btn" title="隱藏選單／舞台全屏"><i class="fa-solid fa-bars"></i></button>' +
            '<button class="lstage-edit-btn" title="擺設模式"><i class="fa-solid fa-pen-ruler"></i></button>' +
            '<button class="lstage-theater-btn" title="小劇場"><i class="fa-solid fa-clapperboard"></i><span class="ltb-tx">小劇場</span><span class="ltb-badge"></span></button>' +
            // 🏙 快轉地圖：書咖/大廳/城裡都出現（404 要走還原流程）
            ((S.scene === 'cafe' || S.scene === 'hall' || S.scene === 'city') ? '<button class="lstage-city-btn" title="快轉地圖"><i class="fa-solid fa-map-location-dot"></i></button>' : '');
        left.appendChild(root);
        _applyMenuHidden();   // 套用上次「舞台全屏（隱藏 MAIN MENU）」狀態
        if (S._theaterTimer) clearInterval(S._theaterTimer);
        S._theaterTimer = setInterval(() => window.LobbyTheater?.tick(), 15000);   // 🎭 小劇場輪詢（實作在 lobby_theater.js）
        root.querySelector('.lstage-menu-btn').addEventListener('click', () => {
            const on = localStorage.getItem('lobby_stage_menu_hidden') === '1';
            try { localStorage.setItem('lobby_stage_menu_hidden', on ? '0' : '1'); } catch (e) {}
            _applyMenuHidden();
        });
        root.querySelector('.lstage-set-btn').addEventListener('click', () => _openLobbySettings());
        // 🎬 小劇場窗口：有未查看的配對→開「正在對話」，否則直接看「回顧」
        root.querySelector('.lstage-theater-btn').addEventListener('click', () => window.LobbyTheater?.openWin(S.theater && !S.theater.playing ? 'live' : 'review'));
        root.querySelector('.lstage-city-btn')?.addEventListener('click', () => _openCityMap());   // 🏙 快轉地圖（廣場俯瞰縮圖,點哪去哪）
        left.classList.add('lstage-on', 'lstage-dlg-hidden');   // 對話框預設收起，開聊才浮出
        // 💬 聊天符號（自由漫遊時的浮鈕）：點了浮出「對話框＋輸入框」一組
        const fab = document.createElement('button');
        fab.className = 'lstage-chat-fab';
        fab.title = '開啟對話';
        fab.innerHTML = '<i class="fa-solid fa-comment-dots"></i>';
        fab.addEventListener('click', (e) => { e.stopPropagation(); showDialog(); });
        left.appendChild(fab);
        if (!isStatic) _setupJoystick(root);   // 🕹️ 手機左下角虛擬搖桿（靜態地圖沒走路→不需要）
        S.root = root; S.world = root.querySelector('.lstage-world'); S.active = true;
        S.doorArm = false;   // 剛進場先解除門武裝，走出門區才啟動
        // 底圖：本機/網址覆蓋（建構模式「換底圖」）
        if (CFG.baseOverride) {
            const mapImg = root.querySelector('.lstage-map');
            resolveRef(CFG.baseOverride).then(src => { if (src && mapImg) mapImg.src = src; });
        }
        // 🌳 前景上層：外圈樹/前景素材蓋在角色之上（走到樹後被遮，不會踩在樹上）；z 高於所有小人；編輯模式隱藏
        // 🧱 背景遮擋層 lower：在底圖之上、所有物件/角色之下（被全部物件遮住）；如廣場北牆(後牆)。可單張或陣列。
        const _dayNight = (f) => (_sceneIsNight(SCENES[S.scene]) && CITY_NIGHT[f]) ? CITY_NIGHT[f] : f;   // 🌙 牆框層也吃夜版對照
        if (SCENES[S.scene].lower) {
            const _lowers = Array.isArray(SCENES[S.scene].lower) ? SCENES[S.scene].lower : [SCENES[S.scene].lower];
            for (const _lf of _lowers) {
                const lo = document.createElement('img');
                lo.className = 'lstage-lower';
                lo.width = MAP_W; lo.height = MAP_H;
                resolveRef({ file: _dayNight(_lf) }).then(src => { if (src) lo.src = src; });
                S.world.appendChild(lo);
            }
        }
        //    upper 可給單張或陣列（多張前景層，如廣場南牆/前牆）
        if (SCENES[S.scene].upper) {
            const _uppers = Array.isArray(SCENES[S.scene].upper) ? SCENES[S.scene].upper : [SCENES[S.scene].upper];
            for (const _uf of _uppers) {
                const up = document.createElement('img');
                up.className = 'lstage-upper';
                up.width = MAP_W; up.height = MAP_H;
                resolveRef({ file: _dayNight(_uf) }).then(src => { if (src) up.src = src; });
                S.world.appendChild(up);
            }
        }
        S.objEls = CFG.layout.map(o => _spawnObjEl(o));
        const editBtn = root.querySelector('.lstage-edit-btn');
        if (isStatic) editBtn.style.display = 'none';   // 靜態地圖沒有可拖佈局→藏擺設鈕
        else editBtn.addEventListener('click', () => window.LobbyEditor?.toggle());   // 🖊 擺設模式（實作在 lobby_editor.js）
        // 🗺️ 靜態點擊地圖：畫建築點擊區（點了白光過場進室內），跳過所有走路系統
        if (isStatic) {
            (SCENES[S.scene].hotspots || []).forEach(hs => {
                const el = document.createElement('div');
                el.className = 'lstage-hotspot';
                el.style.left = hs.x + 'px'; el.style.top = hs.y + 'px';
                el.style.width = hs.w + 'px'; el.style.height = hs.h + 'px';
                if (hs.label) el.innerHTML = '<span class="lstage-hotspot-chip"><i class="fa-solid fa-door-open"></i> ' + hs.label + '</span>';
                el.addEventListener('click', () => goScene(hs.to, hs.spawn, 'arrive'));
                S.world.appendChild(el);
            });
            _applySceneHeader();
            fitCamera();
            window.addEventListener('resize', fitCamera);
            try { S._ro = new ResizeObserver(() => fitCamera()); S._ro.observe(root); } catch (e) {}
            console.log('[LobbyStage] mounted (static map)');
            return;
        }
        // 座標命中角色（不動角色 pointer-events）：桌機右鍵、手機長按共用
        const _hitAt = (clientX, clientY) => {
            const r = S.world.getBoundingClientRect();
            const mx = (clientX - r.left) / S.scale, my = (clientY - r.top) / S.scale;
            return ((S.player ? [S.player] : []).concat(S.npcs)).find(a => {
                const w = Math.max(50, a.h * ((a.frameW && a.frameH) ? a.frameW / a.frameH : 0.6));
                return mx > a.x - w / 2 && mx < a.x + w / 2 && my > a.y - a.h && my < a.y;
            });
        };
        // 👗 桌機：右鍵角色→下拉單
        root.addEventListener('contextmenu', (e) => {
            if (S.edit) return;
            const hit = _hitAt(e.clientX, e.clientY);
            if (!hit) return;
            e.preventDefault(); e.stopPropagation();
            window.LobbyDress?.openMenu(hit, e.clientX, e.clientY);
        });
        // 📱 手機：長按角色→下拉單（contextmenu 手機不可靠，改自訂長按計時器；移動/放開即取消）
        let _lpTimer = null, _lpX = 0, _lpY = 0;
        root.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'touch' || S.edit) return;
            if (e.target.closest('.lstage-joy, .lstage-menu-btn, .lstage-edit-btn, .lstage-chat-fab, .lstage-hint, #iris-dialogue-box')) return;
            _lpX = e.clientX; _lpY = e.clientY;
            clearTimeout(_lpTimer);
            _lpTimer = setTimeout(() => {
                _lpTimer = null;
                const hit = _hitAt(_lpX, _lpY);
                if (hit) { _lpSuppressClick = true; window.LobbyDress?.openMenu(hit, _lpX, _lpY); }
            }, 450);
        });
        const _lpCancel = (e) => {
            if (!_lpTimer) return;
            if (e && e.type === 'pointermove' && Math.hypot(e.clientX - _lpX, e.clientY - _lpY) <= 12) return;   // 小抖動不算移動
            clearTimeout(_lpTimer); _lpTimer = null;
        };
        root.addEventListener('pointermove', _lpCancel);
        root.addEventListener('pointerup', _lpCancel);
        root.addEventListener('pointercancel', _lpCancel);
        initPlayer();
        window.LobbyNpcs?.init();   // 🧑‍🤝‍🧑 NPC 生成（實作在 lobby_npcs.js；async 不等——NPC 陸續刷出即可）
        _applySceneHeader();
        fitCamera();
        window.addEventListener('resize', fitCamera);
        // 容器自身變寬窄（漢堡全屏、佈局模式切換）不一定觸發 window resize → ResizeObserver 補刀
        try { S._ro = new ResizeObserver(() => fitCamera()); S._ro.observe(root); } catch (e) {}
        S.last = performance.now();
        S.raf = requestAnimationFrame(tick);
        // 🏘 MC地塊真狀態在 OS_PT(OS_DB)：掛載後異步對帳（買過→蓋房；沒買→空地）；本場景沒MC地塊也無害
        try { window.OS_PT?.getPlotBuilt?.('player')?.then?.(b => { if (S.active) setPlot('player', !!b); }); } catch (e) {}
        console.log('[LobbyStage] mounted');
    }
    function _spawnObjEl(o) {
        const img = document.createElement('img');
        img.className = 'lstage-actor lstage-obj';
        if (o.float) img.classList.add('lstage-float');   // 飄浮物件（如 LUNA-VII 核心）
        // 夜間成對素材：手動 nightFile 優先，其次 CITY_NIGHT 對照表；場景是夜才換（座標/佔地不變）
        const _nf = _sceneIsNight(SCENES[S.scene]) ? (o.nightFile || CITY_NIGHT[o.file]) : null;
        const ref = _nf ? Object.assign({}, o, { file: _nf }) : o;
        const wantAlpha = !!SCENES[S.scene].alphaFoot;   // 大地圖建築：抽 alpha 形狀做碰撞
        resolveRef(ref).then(src => {
            if (!src) return;
            // 🚨 alphaFoot：顯示圖本身就掛 crossOrigin（避免先無 CORS 載一次污染快取→canvas 讀不到 alpha）；直接從這張抽，不開第二探針
            if (wantAlpha && !String(src).startsWith('data:')) img.crossOrigin = 'anonymous';
            img.src = src;
            if (wantAlpha) {
                const grab = () => _extractObjAlpha(o, img);
                if (img.complete && img.naturalWidth) grab();
                else img.addEventListener('load', grab, { once: true });
            }
        });
        placeObj(img, o);
        _applyPlotVis(o, img);   // 🏘 地塊：這件是「沒入住的房」或「已蓋房的空地框」→藏起來(擺設模式半透明可調)
        S.world.appendChild(img);
        return img;
    }
    function placeObj(img, o) {
        const d = effDims(o);
        img.style.left = o.x + 'px';
        img.style.top = o.y + 'px';
        img.style.width = d.ew + 'px';
        // 深度層級：floor=地板(壓最底、人踩上面)、back=牆背景(在物件後面)、其餘=自動腳底深度(能走前走後)
        let z;
        if (o.layer === 'floor') z = 1;
        else if (o.layer === 'back') z = 2;
        else z = 2 + Math.round(o.y + d.eh + (o.zb || 0));   // zb=疊層微調(±px)：小物件立在大物件前緣(看板在屋前)時,底邊比不過→手動往前擠
        img.style.zIndex = String(z);
        img.style.transform = o.flipX ? 'scaleX(-1)' : '';   // 水平翻轉（一張素材當左右兩用）
    }
    function unmount() {
        if (!S.active) return;
        if (S._theaterTimer) { clearInterval(S._theaterTimer); S._theaterTimer = null; }
        window.LobbyTheater?.end();
        if (S.edit) window.LobbyEditor?.exit(false);
        if (S.onWheel) { try { S.root?.removeEventListener('wheel', S.onWheel, { passive: false }); } catch (e) {} S.onWheel = null; }
        _closeWins();
        S.joy = null;   // 清搖桿殘留方向
        document.querySelector('.lobby-body')?.classList.remove('stage-menu-hidden');   // 舞台關掉→純文字大廳要看得到選單
        endTalk();
        cancelAnimationFrame(S.raf);
        if (S.sleepT) { clearTimeout(S.sleepT); S.sleepT = null; }
        _wx = null; S._wxRoll = null;   // 🌦 天氣層 canvas 跟著 S.root.remove() 一起走;auto骰子下次進場重擲
        window.removeEventListener('resize', fitCamera);
        if (S._ro) { try { S._ro.disconnect(); } catch (e) {} S._ro = null; }
        if (S.onKey) {
            window.removeEventListener('keydown', S.onKey, true);
            window.removeEventListener('keyup', S.onKey, true);
            S.onKey = null;
        }
        S.root?.remove();
        const _left = document.querySelector('.lobby-left');
        if (_left) {
            _left.classList.remove('lstage-on', 'lstage-dlg-hidden');
            _left.querySelector('.lstage-talk-portrait')?.remove();
            _left.querySelector('.lstage-chat-fab')?.remove();
        }
        S.root = S.world = null;
        S.player = null; S.npcs = []; S.talkTarget = null; S.followers = []; S.keys = {}; S.objEls = [];
        S.mask = null;
        S.active = false;
        console.log('[LobbyStage] unmounted');
    }

    // 🖊 擺設模式（編輯器：拖物件/站位/門區/鋼索、佔地調整、換底圖遮罩、匯出存檔）→ 拆到 lobby_editor.js（走 _b 橋；2026-07-16）

    // 建構模式選圖：貼網址或留空→從電腦選擇圖片（上傳存進本機資產庫 IndexedDB）
    // ── 🧊 像素處理管線：去背（邊緣連通 BFS）＋掃碎片；opts.noGrid=true 時「不壓縮」──
    //   壓縮（縮到 96px 高、nearest=大顆粒）只給手動「壓成像素小小人」用；
    //   裝扮室「生成單張立姿圖」走 noGrid＝畫風原封不動（Rae：以後要換不同Q版畫風，有些畫風不能壓）。
    //   去背只挖「從四邊連通進來、跟邊框主色相近」的像素，不做全域色鍵——
    //   全域色鍵會把身體內部同色塊一起挖掉（老教訓）。
    function _loadImg(src) {
        return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    }
    async function _pixelify(src, opts) {
        try {
            // 網址圖先抓成 dataURL（直接畫進 canvas 會被跨網域汙染、readback 直接炸）
            if (/^https?:/i.test(String(src))) {
                try {
                    const b = await (await fetch(src)).blob();
                    src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
                } catch (e) { return null; }
            }
            const img = await _loadImg(src);
            let W, H;
            if (opts && opts.noGrid) {
                W = img.naturalWidth || 1; H = img.naturalHeight || 1;   // 原尺寸原畫風，不格點化
            } else {
                H = 96; W = Math.max(1, Math.round((img.naturalWidth || 1) * H / (img.naturalHeight || 1)));
            }
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.imageSmoothingEnabled = false;   // 關平滑=最近鄰取樣（noGrid 時 1:1 畫、無影響）
            ctx.drawImage(img, 0, 0, W, H);
            const d = ctx.getImageData(0, 0, W, H), px = d.data;
            // 邊框主色：四邊像素投票；夠一致（>40%）才視為單色背景
            const votes = new Map(); let borderN = 0, transparentN = 0;
            const at = (x, y) => (y * W + x) * 4;
            const border = [];
            for (let x = 0; x < W; x++) border.push([x, 0], [x, H - 1]);
            for (let y = 1; y < H - 1; y++) border.push([0, y], [W - 1, y]);
            for (const [x, y] of border) {
                const i = at(x, y); borderN++;
                if (px[i + 3] < 16) { transparentN++; continue; }
                const k = (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);   // 量化到16階再投票（抗輕微雜訊）
                votes.set(k, (votes.get(k) || 0) + 1);
            }
            if (transparentN < borderN * 0.5 && votes.size) {   // 邊框大多已透明=本來就去過背，跳過
                let bestK = '', bestC = 0;
                votes.forEach((c, k) => { if (c > bestC) { bestC = c; bestK = k; } });
                if (bestC > borderN * 0.4) {
                    const [br, bg, bb] = bestK.split(',').map(n => (parseInt(n, 10) << 4) + 8);
                    const near = (i) => px[i + 3] > 0 && (Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb)) < 72;
                    const seen = new Uint8Array(W * H); const q = [];
                    for (const [x, y] of border) { const p = y * W + x; if (!seen[p] && near(p * 4)) { seen[p] = 1; q.push(p); } }
                    while (q.length) {
                        const p = q.pop(); px[p * 4 + 3] = 0;
                        const x = p % W, y = (p / W) | 0;
                        if (x > 0 && !seen[p - 1] && near((p - 1) * 4)) { seen[p - 1] = 1; q.push(p - 1); }
                        if (x < W - 1 && !seen[p + 1] && near((p + 1) * 4)) { seen[p + 1] = 1; q.push(p + 1); }
                        if (y > 0 && !seen[p - W] && near((p - W) * 4)) { seen[p - W] = 1; q.push(p - W); }
                        if (y < H - 1 && !seen[p + W] && near((p + W) * 4)) { seen[p + W] = 1; q.push(p + W); }
                    }
                }
            }
            // 🧹 掃碎片：去背後常剩「飄在主體周圍的雜點/迷你分身」（SDXL 像素圖通病）。
            //   連通塊分析：只留最大塊＋面積≥最大塊25%的大附件；碎屑/旁邊的小複製人全清。
            //   全圖不透明（去背沒發生）＝整張一塊，自然跳過、不誤傷。
            //   ⚠️ 走路圖(sheet)必須跳過：3×4的12格各是獨立連通塊，掃碎片會把11格角色當碎屑刪光。
            if (!(opts && opts.sheet)) {
                const label = new Int32Array(W * H).fill(-1);
                const areas = [];
                const qq = [];
                for (let p0 = 0; p0 < W * H; p0++) {
                    if (label[p0] !== -1 || px[p0 * 4 + 3] === 0) continue;
                    const id = areas.length; let area = 0;
                    label[p0] = id; qq.length = 0; qq.push(p0);
                    while (qq.length) {
                        const p = qq.pop(); area++;
                        const x = p % W, y = (p / W) | 0;
                        if (x > 0     && label[p - 1] === -1 && px[(p - 1) * 4 + 3] > 0) { label[p - 1] = id; qq.push(p - 1); }
                        if (x < W - 1 && label[p + 1] === -1 && px[(p + 1) * 4 + 3] > 0) { label[p + 1] = id; qq.push(p + 1); }
                        if (y > 0     && label[p - W] === -1 && px[(p - W) * 4 + 3] > 0) { label[p - W] = id; qq.push(p - W); }
                        if (y < H - 1 && label[p + W] === -1 && px[(p + W) * 4 + 3] > 0) { label[p + W] = id; qq.push(p + W); }
                    }
                    areas.push(area);
                }
                if (areas.length > 1) {
                    const biggest = Math.max.apply(null, areas);
                    const keepMin = Math.max(12, biggest * 0.25);
                    for (let p = 0; p < W * H; p++) {
                        const id = label[p];
                        if (id !== -1 && areas[id] < keepMin) px[p * 4 + 3] = 0;
                    }
                }
            }
            ctx.putImageData(d, 0, 0);
            // ✂️ 收緊透明邊：原圖(如512×728)角色多半只佔中間一塊，去背後大量留白仍撐著畫布，
            //   舞台照畫布高度縮放 → 角色被留白吃掉顯得特別小、腳還會浮空。裁到人物外框，
            //   尺寸才對得上走路圖角色（瀅瀅/玩家塞滿整格）。全不透明(沒去背)＝外框=全圖，自然跳過不誤傷。
            //   ⚠️ 走路圖(sheet)跳過：整片裁切會打亂3×4的格線對齊。
            if (!(opts && opts.sheet)) {
                let minX = W, minY = H, maxX = -1, maxY = -1;
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        if (px[(y * W + x) * 4 + 3] > 0) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
                if (maxX >= minX && maxY >= minY && (maxX - minX + 1 < W || maxY - minY + 1 < H)) {
                    const cw = maxX - minX + 1, ch = maxY - minY + 1;
                    const out = document.createElement('canvas'); out.width = cw; out.height = ch;
                    out.getContext('2d').drawImage(cv, minX, minY, cw, ch, 0, 0, cw, ch);
                    return out.toDataURL('image/png');
                }
            }
            return cv.toDataURL('image/png');
        } catch (e) { console.warn('[LobbyStage] _pixelify 失敗', e); return null; }
    }

    function _askImage(cb) {
        const url = window.prompt('貼上圖片網址；或留空按「確定」改為從電腦選擇圖片');
        if (url === null) return;
        if (url.trim()) { cb({ url: url.trim() }); return; }
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            const rd = new FileReader();
            rd.onload = async () => {
                const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                try { await idbPut(id, rd.result); cb({ idb: id }, rd.result); }
                catch (e) { console.warn('[LobbyStage] 圖片存檔失敗', e); }
            };
            rd.readAsDataURL(f);
        };
        inp.click();
    }

    // ── 🔌 拆檔橋＋窗口互斥登記制 ──
    //    子模組（lobby_theater.js…）經 window.LobbyStage._b 借核心狀態/工具，載入順序=lobby_stage 先。
    //    各小窗把自己的 close 函式 regWin() 進互斥圈；誰要開窗先 closeWins() 全關（含自己的舊窗）。
    const _winClosers = [_closeLobbySettings];   // 裝扮室三小窗在 lobby_dress.js 自己 regWin
    function _regWin(fn) { _winClosers.push(fn); return fn; }
    function _closeWins() { _winClosers.forEach(fn => { try { fn(); } catch (e) {} }); }

    window.LobbyStage = {
        tryMount, unmount,
        enter404Stage, exit404Stage,
        isActive: () => S.active,
        isOn,
        getTalkTarget: () => S.talkTarget,
        getDefaultTarget,
        setTalkTarget: (t) => { S.talkTarget = t || null; },
        endTalk,
        showDialog,
        hideDialog,
        getNpcHistory,
        pushNpcHistory,
        popNpcHistoryTail,
        truncateNpcHistory,
        setNpcHistory,
        setPlot,                            // 🏘 地塊「空地↔蓋房」切換（經濟③入住流程呼叫；console 也可手動）
        plotOccupied: _plotOccupied,
        rollGuestPool: () => window.LobbyNpcs?.rollGuestPool(),   // console 診斷用：看日誌 NPC 池撈到誰（無 F12 環境靠這個；懶解析到 lobby_npcs.js，async 透傳）
        pixelify: _pixelify,                // console 診斷用：手動壓小小人（回 dataURL）
        openDressRoom: (a) => window.LobbyDress?.openRoom(a),   // console 診斷用：直接開某個角色的裝扮室（傳 _S.npcs 裡的物件）
        _S: S,
        _b: {   // 🔌 拆檔橋：子模組專用（lobby_theater.js…），外部腳本別戳
            S,
            get CFG() { return CFG; },   // CFG 會整顆換（_loadCfg），必須走 getter
            MAP_W, MAP_H, SCENES, SCENE_HEADER,
            placeActor,
            regWin: _regWin, closeWins: _closeWins,
            // 給 lobby_dress.js（裝扮室/歷史窗）：皮膚存取/換裝/圖片工具/NPC歷史資料
            skins: _skins, saveSkin: _saveSkin,
            swapActorSrc: _swapActorSrc, applySkin: _applySkin,
            pixelify: _pixelify, askImage: _askImage,
            resolveRef, idbPut,
            getNpcHistory, setNpcHistory,
            // 給 lobby_editor.js（擺設模式）：物件擺放/佔地/碰撞重建/遮罩/人物縮放/相機重算
            placeObj, spawnObjEl: _spawnObjEl, footRect,
            rebuildBlocks, loadMask, applyActorScale, fitCamera,
            setPlot, plotOccupied: _plotOccupied,   // 🏘 地塊切換（編輯器「蓋房/空地」鈕）
            // 給 lobby_npcs.js（NPC 生成/名冊）：素材表/生NPC/碰撞判定/站位開闊度採樣
            ASSET, addNpc, blocked, whiteRatio: _whiteRatio,
        },
    };
})();
