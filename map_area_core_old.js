/**
 * 奧瑞亞地圖面板 - 地圖區域核心功能 v2.0
 * 負責地圖視圖、設施管理、劇情選單等
 * 
 * v2.0 更新：
 * - 整合統一日志系統
 * - 優化官方API集成
 * - 改善錯誤處理機制
 */

// 区域核心模块

// 獲取酒館官方API (Enhanced Version - With detailed detection)
const getOfficialAPI = () => {
    // 详细检测多个API源
    const parentTH = window.parent?.TavernHelper;
    const localTH = window.TavernHelper;
    const parentST = window.parent?.SillyTavern;
    const localST = window.SillyTavern;
    
    const api = {
        TavernHelper: parentTH || localTH || null,
        SillyTavern: parentST || localST || null,
        eventSource: window.eventSource || null
    };
    

    
    return api;
};



// ===== 地圖區域相關全局變量 =====
let currentLocation = 'storyHome'; // Default location is the new story home
let currentDistrict = '';
let currentFacility = '';
let selectedTime = '';
let currentCharacterInFacility = '';
let currentView = 'storyHome'; // home, map, facility, location (home is now storyHome)

// 設施管理變量
let isDragMode = false;
let selectedEmoji = '☕';
let editingFacilityId = '';
let editSelectedEmoji = '☕';
let customFacilities = {}; // 存儲自定義設施
let facilityPositions = {}; // 存儲設施位置
let deletedFacilities = {}; // 存儲已刪除的設施ID
let selectedAtmosphere = '';
// 拖動相關變量
let isDragging = false;
let draggedElement = null;
let animationFrameId = null;
let dragStartCursor = { x: 0, y: 0 };
let elementStartPos = { x: 0, y: 0 };
let currentCursorPos = { x: 0, y: 0 };

// 資源路徑配置
const BASE_BACKGROUNDS_URL = 'https://nancywang3641.github.io/sound-files/location_img/';

// 地圖數據配置 - 包含所有設施
const DISTRICTS = {
    'A': {
        name: 'Solarium 日暉區',
        background: 'https://nancywang3641.github.io/sound-files/location_img/A區_日暉區.jpg',
        facilities: {
            'Stellar_Nexus': { 
                name: 'Stellar Nexus 總部', 
                icon: '🏢', 
                shortName: '總部', 
                className: 'facility-stellar', 
                characters: [], 
                imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Stellar_Nexus.jpeg',
                keywords: ['Stellar Nexus', '總部', '技術研發區', '企業戰略區', '高層辦公區', '產品開發實驗室', '高層會議室', '財務部', '品牌市場部', '公關合作區', '訪客辦公室']
            },
            'MYCIA_Mall': { name: 'MYCIA 商場', icon: '🛍️', shortName: '商場', className: 'facility-mycia', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_MYCIA_商場.jpeg' },
            'Ion_Root': { name: 'Ion Root 能源核心塔', icon: '⚡', shortName: '能源塔', className: 'facility-ion-root', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_IonRoot_能源核心塔.jpeg' },
            'Lumen_Loop': { name: 'Lumen Loop 轉運中樞站', icon: '🚇', shortName: '轉運站', className: 'facility-lumen-loop', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_LumenLoop_轉運中樞站.jpeg' },
            'Solarium_Tower': { name: 'Solarium 安全塔總署', icon: '🛡️', shortName: '安全塔', className: 'facility-solarium-tower', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Solarium_安全塔總署.jpeg' },
            'Aegis_Link': { name: 'Aegis Link', icon: '🔗', shortName: '連結', className: 'facility-aegis-link', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_AegisLink.jpeg' },
            'Citadel_Tower': { name: 'Citadel 中央情報塔', icon: '🗼', shortName: '情報塔', className: 'facility-citadel', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Citadel_中央情报塔.jpeg' },
            'Metro_Cafe': { name: 'Metro Café 小站咖啡', icon: '☕', shortName: '咖啡', className: 'facility-metro-cafe', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Metro_Café_小站咖啡.jpeg' },
            'NOVA_Select': { name: 'NOVA Select Mart', icon: '🏪', shortName: '超市', className: 'facility-nova-select', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_NOVA_SelectMart.jpeg' },
            'Novacore_Node': { name: 'Novacore Sat-Node', icon: '📡', shortName: '衛星節點', className: 'facility-novacore', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Novacore_Sat-Node.jpeg' },
            'Orion_Global': { name: 'Orion Global', icon: '🌐', shortName: '全球', className: 'facility-orion', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_OrionGlobal.jpeg' },
            'Prime_Spoon': { name: 'Prime Spoon 商務食堂', icon: '🍽️', shortName: '食堂', className: 'facility-prime-spoon', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_PrimeSpoon_商務食堂.jpeg' },
            'Pulse_Drops': { name: 'Pulse Drops 濃縮飲水機站', icon: '💧', shortName: '飲水站', className: 'facility-pulse-drops', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_PulseDrops_浓缩饮水机站.jpeg' },
            'Quick_Shell': { name: 'Quick Shell 修容艙站', icon: '💄', shortName: '修容', className: 'facility-quick-shell', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Quick_Shell_修容舱站.jpeg' },
            'Sky_Duct': { name: 'Sky Duct 空氣處理塔', icon: '🌬️', shortName: '空氣塔', className: 'facility-sky-duct', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_SkyDuct_空氣處理塔.jpeg' },
            'SkyLaw': { name: 'SkyLaw', icon: '⚖️', shortName: '法務', className: 'facility-skylaw', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_SkyLaw.jpeg' },
            'Solace_Lounge': { name: 'Solace Lounge', icon: '🛋️', shortName: '休息室', className: 'facility-solace', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Solace_Lounge.jpeg' },
            'Solaris_Apex': { name: 'Solaris Apex', icon: '🌟', shortName: '頂點', className: 'facility-solaris', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Solaris_Apex.jpeg' },
            'Unfold_Stand': { name: 'Unfold 書報亭', icon: '📰', shortName: '書報亭', className: 'facility-unfold', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Unfold_书报亭.jpeg' },
            'Health_Station': { name: '衛生急救所', icon: '🏥', shortName: '急救所', className: 'facility-health', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_衛生急救所.jpeg' }
        }
    },
    'B': {
        name: 'Nocturne 夜韻街區',
        background: 'https://nancywang3641.github.io/sound-files/char_home/B%E5%8D%80_%E5%A4%9C%E9%9F%BB%E8%A1%97%E5%8D%80.jpg',
        facilities: {
            'LUXA_DOME': { name: 'LUXA 路克薩巨蛋', icon: '🎭', shortName: '巨蛋', className: 'facility-luxa', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_LUXA_DOME_路克萨巨蛋.jpeg' },
            'Echo_Veil': { name: 'Echo Veil 迴音紗劇院', icon: '🎪', shortName: '劇院', className: 'facility-echo-veil', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_EchoVeil_回音紗劇院.jpeg' },
            'NOVA_Mall': { name: 'NOVA 百貨環廊', icon: '🛒', shortName: '百貨', className: 'facility-nova-mall', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_NOVA_百貨環廊.jpeg' },
            'Decibel_Ruins': { name: '聲波廢墟俱樂部', icon: '🎵', shortName: '俱樂部', className: 'facility-decibel', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_聲波廢墟俱樂部.jpeg' },
            'Meowspell_Lounge': { name: 'Meowspell 貓惑館', icon: '🐱', shortName: '貓惑館', className: 'facility-meowspell', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_Meowspell_Lounge_貓惑館.jpeg' },
            'Insomnia_Cafe': { name: '不眠咖啡', icon: '☕', shortName: '咖啡廳', className: 'facility-insomnia', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_不眠咖啡.jpeg' },
            'B_Lite_Node': { name: 'B-Lite Node 捷運站', icon: '🚆', shortName: '捷運站', className: 'facility-b-lite', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_B-Lite_Node_捷運站.jpeg' },
            'B_Station_Group': { name: 'B系統站群 公車站', icon: '🚌', shortName: '公車站', className: 'facility-b-station', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_B系統站群_公車站.jpeg' },
            'B_Street_24': { name: 'B街24', icon: '🏠', shortName: 'B街24', className: 'facility-b-street', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_B街24.jpeg' },
            'Frequency_Lab': { name: 'Frequency Lab 頻率實驗室', icon: '🔬', shortName: '實驗室', className: 'facility-frequency', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_FrequencyLab_頻率實驗室.jpeg' },
            'HYPEWALL': { name: 'HYPEWALL 脈衝牆', icon: '⚡', shortName: '脈衝牆', className: 'facility-hypewall', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_HYPEWALL_脈衝牆.jpeg' },
            'Nocturne_Arena': { name: 'Nocturne Arena 夜韵競技館', icon: '🏟️', shortName: '競技館', className: 'facility-arena', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_Nocturne Arena_夜韵竞技馆.jpeg' },
            'Nocturne_Police': { name: 'Nocturne 公安分局', icon: '👮', shortName: '公安', className: 'facility-police', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_Nocturne_公安分局.jpeg' },
            'Nocturne_Library': { name: 'Nocturne 圖書街', icon: '📚', shortName: '圖書街', className: 'facility-library', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_Nocturne_圖書街.jpeg' },
            'Medical_Center_B': { name: '區立綜合診療所', icon: '🏥', shortName: '診療所', className: 'facility-medical-b', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_區立綜合診療所.jpeg' },
            'Graffiti_Buildings': { name: '塗鴉樓群', icon: '🎨', shortName: '塗鴉樓', className: 'facility-graffiti', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_塗鴉樓群.jpeg' },
            'Night_Market': { name: '夜市核心區', icon: '🌃', shortName: '夜市', className: 'facility-night-market', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_夜市核心區.jpeg' },
            'Night_Fire_Station': { name: '夜語消防所', icon: '🚒', shortName: '消防所', className: 'facility-fire', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_夜語消防所.jpeg' },
            'Fantasy_Corridor': { name: '幻域走廊', icon: '🌌', shortName: '幻域', className: 'facility-fantasy', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_幻域走廊.jpeg' },
            'Twilight_Bakery': { name: '暮光烘焙所', icon: '🥖', shortName: '烘焙所', className: 'facility-bakery', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_暮光烘焙所.jpeg' },
            'Energy_Column': { name: '能源循環柱', icon: '🔋', shortName: '能源柱', className: 'facility-energy', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_能源循環柱.jpeg' },
            'Street_Square': { name: '街聲廣場', icon: '🎪', shortName: '廣場', className: 'facility-square', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_街聲廣場.jpeg' },
            'Memory_Hall': { name: '記憶重組館', icon: '🧠', shortName: '記憶館', className: 'facility-memory', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_記憶重組館.jpeg' },
            'Terrace_Market': { name: '露台市集', icon: '🛒', shortName: '市集', className: 'facility-terrace', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_露台市集.jpeg' },
            'Fire_Machine': { name: '飛火機台', icon: '🔥', shortName: '機台', className: 'facility-fire-machine', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_飛火機台.jpeg' },
            'Creative_Youth_Apartment_B': { name: '創意青年公寓', icon: '🎨', shortName: '青年公寓', className: 'facility-eddie', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_艾迪_創意青年公寓.jpeg' },
            'Fashion_Residence_B': { name: '高端時尚住宅樓', icon: '✨', shortName: '時尚住宅', className: 'facility-viz', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_維茲_高端時尚住宅樓.jpeg' },
            'Downtown_Penthouse_B': { name: '市中心頂樓公寓', icon: '🌆', shortName: '頂樓公寓', className: 'facility-xuyang', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_煦陽_市中心頂樓公寓.jpeg' }
        }
    },
    'C': {
        name: 'Horizon 地平綠域',
        background: 'https://nancywang3641.github.io/sound-files/location_img/C區_地平綠域.jpg',
        facilities: {
            'Hebe_Fountain': { name: '赫柏噴泉', icon: '⛲', shortName: '噴泉', className: 'facility-hebe', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_赫柏噴泉.jpeg' },
            'Civic_Hall': { name: 'Civic Hall 公民廳', icon: '🏛️', shortName: '公民廳', className: 'facility-civic', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_CivicHall_公民厅.jpeg' },
            'Horizon_Medical': { name: 'C-Med 綜合醫院', icon: '🏥', shortName: '醫院', className: 'facility-horizon-medical', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_C-Med_綜合醫院.jpeg' },
            'C_Ring_Residential': { name: 'C-Ring 生活住宅群', icon: '🏘️', shortName: '住宅群', className: 'facility-c-ring', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_C-Ring_生活住宅群.jpeg' },
            'Bus_Station_Group': { name: '信步公車站群', icon: '🚌', shortName: '公車站', className: 'facility-bus-station', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_信步公車站群.jpeg' },
            'Light_Square': { name: '光語廣場', icon: '✨', shortName: '光語', className: 'facility-light-square', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_光語廣場.jpeg' },
            'Peace_Lane': { name: '和平巷', icon: '🕊️', shortName: '和平巷', className: 'facility-peace', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_和平巷.jpeg' },
            'Horizon_College': { name: '地平聯合學苑', icon: '🎓', shortName: '學苑', className: 'facility-college', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_地平聯合學苑.jpeg' },
            'Council_Hall': { name: '地平議會館', icon: '🏛️', shortName: '議會館', className: 'facility-council', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_地平議會館.jpeg' },
            'Cultural_Bureau': { name: '城市文化與歷史研究局', icon: '📜', shortName: '文化局', className: 'facility-cultural', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_城市文化與歷史研究局.jpeg' },
            'Elementary_School': { name: '市立教育聯盟小學', icon: '🏫', shortName: '小學', className: 'facility-elementary', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_市立教育聯盟小學.jpeg' },
            'Mental_Health': { name: '情緒健康站', icon: '💚', shortName: '健康站', className: 'facility-mental', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_情緒健康站.jpeg' },
            'Daily_Market': { name: '日常市集角', icon: '🛒', shortName: '市集', className: 'facility-daily-market', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_日常市集角.jpeg' },
            'Knowledge_Theatre': { name: '知識環劇場', icon: '🎭', shortName: '劇場', className: 'facility-knowledge', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_知識環劇場.jpeg' },
            'Green_Corridor': { name: '綠映回廊', icon: '🌿', shortName: '回廊', className: 'facility-green', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_綠映回廊.jpeg' },
            'Greenhouse': { name: '自然溫室園', icon: '🌱', shortName: '溫室', className: 'facility-greenhouse', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_自然溫室園.jpeg' },
            'City_Museum': { name: '都市博物館', icon: '🏛️', shortName: '博物館', className: 'facility-museum', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_都市博物館.jpeg' },
            'Elder_Clinic': { name: '長者步行診療點', icon: '👴', shortName: '診療點', className: 'facility-elder', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_長者步行診療點.jpeg' },
            'Modern_Highrise_C': { name: '現代高層公寓', icon: '🏢', shortName: '高層公寓', className: 'facility-zixin', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_梓欣_現代高層公寓.jpeg' },
            'Old_Apartment_C': { name: '偏區老舊公寓', icon: '🏚️', shortName: '老舊公寓', className: 'facility-jingming', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_景明_偏區老舊公寓.jpeg' }, 
            'Small_Urban_Apartment_C': { name: '小型都市公寓', icon: '🏠', shortName: '都市公寓', className: 'facility-waite', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_偉特_小型都市公寓.jpeg' }
        }
    },
    'D': {
        name: 'Ivory 象牙高地',
        background: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg',
        facilities: {
            'Vigil_Spire': { name: 'Vigil Spire 守塔', icon: '🗼', shortName: '守塔', className: 'facility-vigil', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_VigilSpire_守塔.jpeg' },
            'Greyshade_Port': { name: '灰影港', icon: '🚢', shortName: '灰影港', className: 'facility-greyshade', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_灰影港.jpeg' },
            'Crimson_Bazaar': { name: '深紅市場', icon: '🛒', shortName: '市場', className: 'facility-crimson-bazaar', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_深紅市場.jpeg' },
            'White_Threshold': { name: '白界實驗所', icon: '🧬', shortName: '實驗所', className: 'facility-white-threshold', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_白界實驗所.jpeg' },
            'Black_Obsidian': { name: '黑曜拍賣會', icon: '🎯', shortName: '拍賣會', className: 'facility-black-obsidian', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_黑曜拍賣會.jpeg' },
            'Crux_Vault': { name: 'Crux Vault', icon: '🔐', shortName: '金庫', className: 'facility-crux', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_CruxVault.jpeg' },
            'D_FORT': { name: 'D-FORT 應變小組站', icon: '🛡️', shortName: '應變站', className: 'facility-d-fort', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_D-FORT_應變小組站.jpeg' },
            'Sky_Dome_Port': { name: 'Sky Dome Port Extension', icon: '🚁', shortName: '空港', className: 'facility-sky-dome', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_SkyDome_Port_Extension.jpeg' },
            'Sprawl_Caves': { name: 'Sprawl Caves 鋪散洞', icon: '🕳️', shortName: '鋪散洞', className: 'facility-sprawl-caves', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_Sprawl Caves_鋪散洞.jpeg' },
            'Sprawl_Tracks': { name: 'Sprawl Tracks 鋪散鐵軌', icon: '🛤️', shortName: '鐵軌', className: 'facility-sprawl-tracks', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_Sprawl Tracks_鋪散鐵軌.jpeg' },
            'X_Kernel_Lab': { name: 'X-Kernel Lab', icon: '🧪', shortName: 'X實驗室', className: 'facility-x-kernel', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_X-Kernel_Lab.jpeg' },
            'Shadow_Street': { name: '亡影街', icon: '👻', shortName: '亡影街', className: 'facility-shadow-street', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_亡影街.jpeg' },
            'Revival_Clinic': { name: '復生診所', icon: '⚕️', shortName: '復生', className: 'facility-revival', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_復生診所.jpeg' },
            'Death_Corridor': { name: '死線走道', icon: '💀', shortName: '死線', className: 'facility-death', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_死線走道.jpeg' },
            'Unmarked_Police': { name: '無標警署', icon: '🕵️', shortName: '警署', className: 'facility-unmarked', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_無標警署.jpeg' },
            'Wealth_Center': { name: '私密財富管理中心', icon: '💰', shortName: '財富', className: 'facility-wealth', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_私密財富管理中心.jpeg' },
            'Ivory_High_School': { name: '象牙國際高中', icon: '🏫', shortName: '高中', className: 'facility-ivory-school', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_象牙國際高中.jpeg' },
            'Ivory_Data_Tower': { name: '象牙數據塔', icon: '💽', shortName: '數據塔', className: 'facility-ivory-data', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_象牙數據塔.jpeg' },
            'Private_Beach_Villa_D': { name: '隱私海濱別墅', icon: '🏖️', shortName: '海濱別墅', className: 'facility-rey', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_雷伊_隱私海濱別墅.jpeg' },
            'Victorian_Gallery_Mansion_D': { name: '新維多利亞長廊宅邸', icon: '🏛️', shortName: '維多利亞宅邸', className: 'facility-kent', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_肯斯頓_新維多利亞長廊宅邸.jpeg' },
            'Lord_Family_Mansion_D': { name: '洛爾德家族豪宅', icon: '🏰', shortName: '家族豪宅', className: 'facility-aisha', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_艾沙_洛爾德家族豪宅.jpeg' },
            'Carlisle_Family_Residence_D': { name: '卡萊爾家族高級住所', icon: '🏘️', shortName: '家族住所', className: 'facility-family-dan', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_卡萊爾家族高級住所.jpeg' }
        }
    },
    'E': {
        name: 'Spirehollow 空塔街坊',
        background: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg',
        facilities: {
            'Wreckspire': { name: 'Wreckspire', icon: '🏗️', shortName: '崩塔', className: 'facility-wreckspire', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_Wreckspire.jpeg' },
            'Crimson_Cellar': { name: 'Crimson Cellar 深紅窖', icon: '🍷', shortName: '深紅窖', className: 'facility-crimson-cellar-d', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_Crimson_Cellar_深紅窖.jpeg' },
            'Shadow_Furnace': { name: 'Shadow Furnace 影熔爐', icon: '🔥', shortName: '熔爐', className: 'facility-shadow-furnace', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_ShadowFurnace_影熔爐.jpeg' },
            'Glitch_Dome': { name: 'Glitch Dome 錯位圓頂', icon: '⚡', shortName: '圓頂', className: 'facility-glitch-dome', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_GlitchDome_錯位圓頂.jpeg' },
            'Phantom_Synapse': { name: 'Phantom Synapse 幻神經核', icon: '🧠', shortName: '神經核', className: 'facility-phantom-synapse', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_PhantomSynapse_幻神經核.jpeg' },
            'Hollow_Choir': { name: 'Hollow Choir 虛合唱團', icon: '🎵', shortName: '合唱團', className: 'facility-hollow-choir', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_HollowChoir_虛合唱團.jpeg' },
            'Mirage_Court': { name: 'Mirage Court 幻廠', icon: '🏭', shortName: '幻廠', className: 'facility-mirage', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_MirageCourt_幻廠.jpeg' },
            'Mute_Vault': { name: 'Mute Vault 沉默庫', icon: '🔇', shortName: '沉默庫', className: 'facility-mute', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_MuteVault_沉默庫.jpeg' },
            'Null_Sanctuary': { name: 'Null Sanctuary 無號庇所', icon: '🏚️', shortName: '庇所', className: 'facility-null', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_NullSanctuary_無號庇所.jpeg' },
            'Phantom_Grid': { name: 'Phantom Grid', icon: '🕸️', shortName: '幻網', className: 'facility-phantom-grid', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_PhantomGrid.jpeg' },
            'Pulse_Street': { name: 'Pulse Street 脈動街', icon: '💓', shortName: '脈動街', className: 'facility-pulse-street', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_PulseStreet_脈動街.jpeg' },
            'ReLive_Lab': { name: 'ReLive Lab 復合診所', icon: '🧬', shortName: '復合所', className: 'facility-relive', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_ReLive-Lab_復合診所.jpeg' },
            'Silent_Haven': { name: 'Silent Haven 靜隅', icon: '🤫', shortName: '靜隅', className: 'facility-silent', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_SilentHaven_靜隅.jpeg' },
            'Veinpath': { name: 'Veinpath 靜脈道', icon: '🩸', shortName: '靜脈道', className: 'facility-veinpath', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_Veinpath_靜脈道.jpeg' },
            'Hacker_Suite_E': { name: '高科技黑客套房', icon: '💻', shortName: '黑客套房', className: 'facility-dan', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_丹尼爾_高科技黑客套房.jpeg' }
        }
    },
    'F': {
        name: 'Aetherdock 蒸穹港域',
        background: 'https://nancywang3641.github.io/sound-files/char_home/F%E5%8D%80_%E8%92%B8%E7%A9%B9%E6%B8%AF%E5%9F%9F.jpg',
        facilities: {
            'Aether_Spires': { name: 'Aether Spires', icon: '🗼', shortName: '以太塔', className: 'facility-aether-spires', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/F區_AetherSpires_以太巨柱.jpeg' },
            'Obel_Port': { name: 'Obel Port 駁岸貨區', icon: '🚢', shortName: '貨區', className: 'facility-obel-port', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/F區_ObelPort_驳岸貨區.jpeg' },
            'Dock_Zero': { name: 'Dock Zero 零號船塢', icon: '⚓', shortName: '船塢', className: 'facility-dock-zero', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/F區_DockZero_零號船塢.jpeg' },
            'L_Helix': { name: 'L-Helix 控制塔', icon: '🧬', shortName: '控制塔', className: 'facility-l-helix', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/F區_L-Helix_控制塔.jpeg' },
            'NetGhost': { name: 'Net Ghost 通訊口', icon: '📶', shortName: '通訊口', className: 'facility-netghost', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/F區_NetGhost_通訊口.jpeg' },
            'F_Zone_Platform': { name: 'F-Zone 機械維修平台', icon: '🔧', shortName: '維修台', className: 'facility-f-zone', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/F區_F-Zone_機械維修平台.jpeg' },
            'Void_Crate_Stack': { name: 'Void Crate Stack 虛箱堆場', icon: '📦', shortName: '堆場', className: 'facility-void-crate', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/F區_VoidCrate Stack_虛箱堆場.jpeg' },
            'Industrial_Loft_F': { name: '工業Loft', icon: '🏭', shortName: '工業Loft', className: 'facility-baize', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/F區_白則_工業Loft.jpg' }
        }
    }
};

// ===== 視圖切換功能 =====

/**
 * 切換視圖 (Enhanced Version - With error handling and performance monitoring)
 */
function toggleView() {
    try {
        const mapView = document.getElementById('mapView');
        const facilityView = document.getElementById('facilityView');
        const storyStatusPage = document.getElementById('storyStatusPage');
        const mapContainer = document.getElementById('mapContainer');
        const locationText = document.getElementById('currentLocationText');

        // 檢查必要的DOM元素
        if (!mapView || !facilityView || !storyStatusPage || !mapContainer) {
            return;
        }

        if (currentView === 'storyHome') {
            // 從故事主頁到地圖
            clearCharacterPrompts(true);
            currentView = 'map';
            storyStatusPage.classList.add('hidden');
            mapContainer.classList.remove('hidden');

            // --- 修正處：在顯示區域總圖前，先確保設施列表是隱藏的 ---
            if (facilityView) facilityView.classList.remove('active');
            // --- 修改結束 ---

            if (mapView) mapView.classList.add('active');
            if (locationText) locationText.textContent = '正在選擇區域';

        } else if (currentView === 'map') {
            // 從地圖回到故事主頁
            goHome();

        } else if (currentView === 'facility') {
            // 從設施列表回到地圖
            clearCharacterPrompts(true);
            currentView = 'map';
            if (facilityView) facilityView.classList.remove('active');
            if (mapView) mapView.classList.add('active');
            if (locationText) locationText.textContent = '正在選擇區域';

        } else if (currentView === 'location') {
            // 從單一設施地點回到設施列表
            clearCharacterPrompts(true);
            showFacilities(currentDistrict);
        }
    } catch (error) {
        if (window.MapUtils) {
            window.MapUtils.showNotification('視圖切換失敗，請重試');
        }
    }
}

/**
 * 回到家
 */
function goHome() {
    clearCharacterPrompts(true);

    currentView = 'storyHome';
    currentLocation = 'storyHome';
    currentDistrict = '';
    currentFacility = '';

    if (isDragMode) {
        toggleDragMode();
    }

    // Call the central function in MapHome to show the story page
    if (window.MapHome && window.MapHome.showStoryHomePage) {
        window.MapHome.showStoryHomePage();
    }

    if (window.MapUtils) {
        window.MapUtils.showNotification('已回到主頁');
    }
}

// ===== 設施管理功能 =====

/**
 * 顯示設施列表 (Stabilized Version)
 */
function showFacilities(district) {
    // 確保 currentDistrict 是最新的
    if (district) {
        currentDistrict = district;
    }

    // 更新視圖狀態
    currentView = 'facility';
    
    const facilityView = document.getElementById('facilityView');
    const mapView = document.getElementById('mapView');
    const facilityIconsContainer = document.getElementById('facilityIconsContainer');
    const facilityViewTitle = document.getElementById('facilityViewTitle');
    const locationText = document.getElementById('currentLocationText');
    const toggleBtn = document.getElementById('toggleViewBtn');

    // 確保視圖正確顯示/隱藏
    if (mapView) mapView.classList.remove('active');
    if (facilityView) facilityView.classList.add('active');
    
    // 移除 location-active class，讓圖標容器恢復可見
    if (facilityView) {
        facilityView.classList.remove('location-active');
    }

    // 更新UI文字和按鈕
    const districtData = DISTRICTS[currentDistrict];
    if (facilityViewTitle) facilityViewTitle.textContent = `${districtData.name} - 設施`;
    if (locationText) locationText.textContent = `正在 ${districtData.name}`;
    if (toggleBtn) {
        toggleBtn.innerHTML = '🔙';
        toggleBtn.title = '返回地圖';
    }

    // 設置區域背景
    if (facilityView) {
        facilityView.style.backgroundImage = `url(${districtData.background})`;
    }

    // 重新生成所有設施圖標
    if (facilityIconsContainer) {
        facilityIconsContainer.innerHTML = ''; // 清空
        const allFacilities = getAllFacilities(currentDistrict);
        
        Object.entries(allFacilities).forEach(([facilityId, facility]) => {
            const facilityIcon = document.createElement('div');
            facilityIcon.className = 'facility-icon-item';
            facilityIcon.dataset.facilityId = facilityId;
            
            if (facility.isCustom) {
                facilityIcon.classList.add('custom-facility');
            }
            
            facilityIcon.onclick = () => {
                if (!isDragMode) enterFacility(facilityId, facility);
            };

            facilityIcon.innerHTML = `
                <div class="facility-emoji">${facility.icon}</div>
                <div class="facility-short-name">${facility.shortName}</div>
            `;

            addFacilityTooltip(facilityIcon, facility);

            // 【核心修复】直接使用内存中的位置数据，不再重新加载
            const savedPosition = facilityPositions[currentDistrict]?.[facilityId];
            if (savedPosition) {
                facilityIcon.style.left = savedPosition.left + '%';
                facilityIcon.style.top = savedPosition.top + '%';
                console.log(`[显示设施] 恢复 ${facilityId} 位置:`, savedPosition);
            }

            facilityIconsContainer.appendChild(facilityIcon);
        });
        
        // 更新角色指示器
        if (window.MapCore) {
            updateCurrentFacilityDisplay();
        }
    }
}


/**
 * 【全新修正版-解決遮擋問題】添加設施 tooltip
 */
function addFacilityTooltip(facilityIcon, facility) {
    let tooltipTimeout;
    let tooltip = null;
    const container = document.getElementById('facilityIconsContainer'); // 先取得主容器

    // 事件監聽：滑鼠移入圖標
    facilityIcon.addEventListener('mouseenter', (e) => {
        if (tooltip || isDragging) return;

        tooltipTimeout = setTimeout(() => {
            tooltip = document.createElement('div');
            tooltip.className = 'facility-tooltip';

            // 【關鍵修改1】改變定位方式，不再依賴父元素
            tooltip.style.cssText = `
                position: absolute; /* 相對於 container 定位 */
                background: rgba(0, 0, 0, 0.9); color: #fff; padding: 10px 15px;
                border-radius: 8px; font-size: 13px; white-space: nowrap;
                border: 1px solid var(--pink-main); box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(5px); pointer-events: none; opacity: 0;
                transition: opacity 0.2s ease; text-align: center;
                z-index: 999; /* 讓 z-index 在新的結構下生效 */
            `;

            const facilityId = facilityIcon.dataset.facilityId;
            const charactersInFacility = window.MapCore ? window.MapCore.getCharactersInFacility(facilityId) : [];
            const characterCount = charactersInFacility.length;

            let contentHTML = `<div style="font-weight: bold; font-size: 15px; color: var(--pink-main); margin-bottom: 5px;">${facility.name}</div>`;
            if (characterCount > 0) {
                contentHTML += `<div style="font-size: 12px; color: #ccc;">內部角色: ${characterCount} 位</div>`;
            } else {
                contentHTML += `<div style="font-size: 12px; color: #888;">內部無角色</div>`;
            }
            tooltip.innerHTML = contentHTML;

            // 【關鍵修改2】將 tooltip 附加到主容器，而不是 icon
            if (container) {
                container.appendChild(tooltip);
            }

            // 【關鍵修改3】手動計算並設置位置
            // 計算 tooltip 的 left，使其在 icon 水平居中
            const iconRect = facilityIcon.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // 計算 icon 在 container 內的相對位置
            const iconTop = iconRect.top - containerRect.top;
            const iconLeft = iconRect.left - containerRect.left;

            // 將 tooltip 放在 icon 的正上方
            tooltip.style.left = `${iconLeft + (facilityIcon.offsetWidth / 2) - (tooltip.offsetWidth / 2)}px`;
            tooltip.style.top = `${iconTop - tooltip.offsetHeight - 10}px`; // 減去自身高度，再加 10px 的間距

            // 讓提示框淡入
            setTimeout(() => { if (tooltip) tooltip.style.opacity = '1'; }, 10);
        }, 400);
    });

    // 事件監聽：滑鼠移出圖標
    facilityIcon.addEventListener('mouseleave', (e) => {
        clearTimeout(tooltipTimeout);
        if (tooltip) {
            tooltip.style.opacity = '0';
            setTimeout(() => {
                if (tooltip && tooltip.parentNode) {
                    tooltip.remove();
                }
                tooltip = null;
            }, 200);
        }
    });
}

/**
 * 更新當前設施顯示
 */
function updateCurrentFacilityDisplay() {
    if (!window.MapCore) {
        return;
    }

    if (currentView !== 'facility') {
        return;
    }
    
    const facilityIconsContainer = document.getElementById('facilityIconsContainer');
    if (!facilityIconsContainer) {
        return;
    }
    
    const facilityIcons = facilityIconsContainer.querySelectorAll('.facility-icon-item');
    
    facilityIcons.forEach((icon, index) => {
        const facilityId = icon.dataset.facilityId;
        if (!facilityId) {
            return;
        }
        
        // 清除現有指示器
        const existingIndicator = icon.querySelector('.facility-character-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // 檢查是否有角色在此設施
        const charactersInFacility = window.MapCore.getCharactersInFacility(facilityId);
        
        if (charactersInFacility.length > 0) {
            const indicator = document.createElement('div');
            indicator.className = 'facility-character-indicator';
            indicator.textContent = charactersInFacility.length;
            indicator.title = `角色：${charactersInFacility.map(c => c.character).join(', ')}`;
            
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                const characterList = charactersInFacility.map(c => 
                    `• ${c.character}\n  狀態: ${c.status}\n  活動: ${c.activity}`
                ).join('\n\n');
                if (window.MapUtils) {
                    window.MapUtils.showNotification(`設施內角色:\n${characterList}`, 5000);
                }
            });
            
            icon.appendChild(indicator);
        }
    });
}

/**
 * 進入設施 (Enhanced Version - With performance monitoring)
 */
function enterFacility(facilityId, facilityData) {
    try {
        clearCharacterPrompts();
    
    currentView = 'location';
    currentFacility = facilityId;
    currentLocation = facilityId;

    const toggleBtn = document.getElementById('toggleViewBtn');
    const locationText = document.getElementById('currentLocationText');
    const facilityView = document.getElementById('facilityView');

    if (facilityView && !facilityView.classList.contains('active')) {
        facilityView.classList.add('active');
    }
    
    // --- 新增：添加 'location-active' class 來觸發CSS，隱藏圖標 ---
    if (facilityView) {
        facilityView.classList.add('location-active');
    }
    // --- 修改結束 ---
    
    if (toggleBtn) {
        toggleBtn.innerHTML = '🔙';
        toggleBtn.title = '返回設施選擇';
    }
    if (locationText) locationText.textContent = `在 ${facilityData.name}`;

    if (window.MapUtils) {
        window.MapUtils.sendMessageToParent({
            type: 'LOCATION_CHANGED',
            location: {
                district: currentDistrict,
                facility: facilityId,
                facilityName: facilityData.name,
                character: '奧瑞亞'
            },
            timestamp: Date.now()
        });
    }

    loadLocationBackground(facilityId);

    // ... (函式後半部分不變) ...
    let allCharactersInFacility = [];
    const hasStaticCharacters = facilityData.characters && facilityData.characters.length > 0;

    if (window.MapCore && typeof window.MapCore.getCharactersInFacility === 'function') {
        try {
            const charactersInFacility = window.MapCore.getCharactersInFacility(facilityId);
            if (charactersInFacility && charactersInFacility.length > 0) {
                allCharactersInFacility = charactersInFacility.map(char => ({
                    name: char.character,
                    status: char.status,
                    activity: char.activity
                }));
            }
        } catch (error) {
            // 忽略错误，继续执行
        }
    }

    if (allCharactersInFacility.length === 0 && hasStaticCharacters) {
        allCharactersInFacility = facilityData.characters.map(charName => ({
            name: charName,
            status: '在此活動',
            activity: '等待互動'
        }));
    }

     if (allCharactersInFacility.length > 0) {
       setTimeout(() => {
          showMultipleCharacterClickPrompt(allCharactersInFacility);
      }, 1500);
    }

    if (window.MapUtils) {
        window.MapUtils.showNotification(`已進入 ${facilityData.name}`);
    }
    } catch (error) {
        if (window.MapUtils) {
            window.MapUtils.showNotification('進入設施失敗，請重試');
        }
    }
}

/**
 * 載入位置背景
 */
function loadLocationBackground(location) {
    if (window.MapUtils) {
        window.MapUtils.showLoading(true);
    }
    
    // --- 修正處：將目標容器從 mapContainer 改為 facilityView ---
    const container = document.getElementById('facilityView');
    if (!container) {
        if (window.MapUtils) {
            window.MapUtils.showLoading(false);
        }
        return;
    }

    const allFacilities = getAllFacilities(currentDistrict);
    const facility = allFacilities[location];

    let backgroundUrl;

    if (facility && facility.imageUrl) {
        backgroundUrl = facility.imageUrl;
    } else {
        const districtData = DISTRICTS[currentDistrict];
        if (districtData && districtData.background) {
            backgroundUrl = districtData.background;
        } else {
            if (window.MapUtils) {
                window.MapUtils.showLoading(false);
            }
            return;
        }
    }
    
    const testImg = new Image();
    testImg.onload = () => {
        container.style.backgroundImage = `url(${encodeURI(backgroundUrl)})`;
        if (window.MapUtils) {
            window.MapUtils.showLoading(false);
        }
    };
    testImg.onerror = () => {
        const districtData = DISTRICTS[currentDistrict];
        if (districtData && districtData.background) {
            container.style.backgroundImage = `url(${encodeURI(districtData.background)})`;
        }
        if (window.MapUtils) {
            window.MapUtils.showLoading(false);
        }
    };
    testImg.src = encodeURI(backgroundUrl);
}

// ===== 角色互動提示 =====

/**
 * 清除角色互動提示
 */
function clearCharacterPrompts(force = false) {
    if (!force) {
        const storyModalActive = document.getElementById('storyModal') && 
                                document.getElementById('storyModal').classList.contains('active');
        const storySelectionActive = document.getElementById('storySelectionModal') && 
                                   document.getElementById('storySelectionModal').classList.contains('active');
        
        if (storyModalActive || storySelectionActive) {
            return;
        }
        
        if (currentView === 'location') {
            return;
        }
    }
    
    const prompts = document.querySelectorAll('.character-interaction-prompt');
    prompts.forEach(prompt => {
        prompt.style.opacity = '0';
        prompt.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => {
            if (prompt.parentNode) prompt.remove();
        }, 300);
    });
}

/**
 * 顯示多個角色的互動提示 (CORRECTED - Appends to correct container)
 */
function showMultipleCharacterClickPrompt(characters) {
    if (!characters || characters.length === 0) return;

    if (characters.length === 1) {
        showCharacterClickPrompt(characters[0].name);
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'character-interaction-prompt persistent multi-character';
    overlay.dataset.characterCount = characters.length;
    overlay.style.cssText = `
        position: absolute;
        bottom: 15%;
        left: 50%;
        transform: translateX(-50%);
        z-index: 60;
        pointer-events: none;
        transition: all 0.3s ease;
        opacity: 0;
    `;
    
    const promptBox = document.createElement('div');
    promptBox.style.cssText = `
        background: rgba(0, 0, 0, 0.9);
        padding: 20px;
        border-radius: 15px;
        text-align: center;
        backdrop-filter: blur(10px);
        border: 2px solid var(--pink-main);
        position: relative;
        cursor: pointer;
        pointer-events: auto;
        min-width: 250px;
        max-width: 300px;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
    `;
    
    const characterListHtml = characters.map((char, index) => `
        <div class="character-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: ${index < characters.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'}; cursor: pointer; transition: background 0.3s ease;" 
        onmouseover="this.style.backgroundColor='rgba(255, 107, 157, 0.2)'"
        onmouseout="this.style.backgroundColor='transparent'"
        onclick="event.stopPropagation(); window.MapArea.selectCharacterForInteraction('${char.name}');">
            <div style="flex: 1; text-align: left;">
                <div style="color: var(--pink-main); font-size: 14px; font-weight: bold;">${char.name}</div>
                <div style="color: var(--text-muted); font-size: 11px;">${char.status}</div>
            </div>
            <div style="color: var(--text-light); font-size: 12px;">👋</div>
        </div>
    `).join('');
    
    promptBox.innerHTML = `
        <button style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease;" 
           onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" 
           onmouseout="this.style.backgroundColor='transparent'"
           onclick="event.stopPropagation(); this.closest('.character-interaction-prompt').remove();">×</button>
        <div style="font-size: 36px; margin-bottom: 12px;">👥</div>
        <div style="color: var(--pink-main); font-size: 16px; margin-bottom: 8px; font-weight: bold;">發現 ${characters.length} 個角色</div>
        <div style="color: var(--text-light); font-size: 12px; margin-bottom: 15px;">選擇要互動的角色：</div>
        <div style="max-height: 200px; overflow-y: auto;">
            ${characterListHtml}
        </div>
        <div style="color: var(--text-muted); font-size: 10px; margin-top: 10px;">此提示將持續顯示直到您選擇</div>
    `;

    overlay.appendChild(promptBox);
    // --- 修正處：將目標容器從 mapMainContainer 改為 mainContentContainer ---
    const container = document.getElementById('mainContentContainer');
    if (container) {
        container.appendChild(overlay);
    }

    setTimeout(() => {
        overlay.style.opacity = '1';
        overlay.style.transform = 'translateX(-50%) translateY(0)';
    }, 100);
}

/**
 * 顯示單個角色互動提示 (CORRECTED - Calls new modal function)
 */
function showCharacterClickPrompt(characterName) {
    const overlay = document.createElement('div');
    overlay.className = 'character-interaction-prompt persistent';
    overlay.dataset.characterName = characterName;
    overlay.style.cssText = `
        position: absolute; bottom: 20%; left: 50%;
        transform: translateX(-50%); z-index: 60; pointer-events: none;
        transition: all 0.3s ease; opacity: 0;
    `;
    
    const promptBox = document.createElement('div');
    promptBox.style.cssText = `
        background: rgba(0, 0, 0, 0.9); padding: 20px; border-radius: 15px;
        text-align: center; backdrop-filter: blur(10px); border: 2px solid var(--pink-main);
        position: relative; cursor: pointer; pointer-events: auto;
        min-width: 200px; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
    `;
    
    promptBox.innerHTML = `
        <button style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease;" 
           onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" 
           onmouseout="this.style.backgroundColor='transparent'"
           onclick="event.stopPropagation(); this.closest('.character-interaction-prompt').remove();">×</button>
        <div style="font-size: 40px; margin-bottom: 10px;">👤</div>
        <div style="color: var(--pink-main); font-size: 18px; margin-bottom: 5px; font-weight: bold;">${characterName}</div>
        <div style="color: var(--text-light); font-size: 14px; margin-bottom: 10px;">點擊開啟劇情</div>
    `;

    // --- 修正處：將呼叫的函式從舊的 openStoryModal 改為新的 openInteractionModal ---
    promptBox.onclick = (e) => {
        e.stopPropagation();
        selectCharacterForInteraction(characterName);
    };

    overlay.appendChild(promptBox);
    const container = document.getElementById('mainContentContainer');
    if (container) {
        container.appendChild(overlay);
    }

    setTimeout(() => {
        overlay.style.opacity = '1';
        overlay.style.transform = 'translateX(-50%) translateY(0)';
    }, 100);
}

/**
 * 選擇角色進行互動
 */
function selectCharacterForInteraction(characterName) {
    // 先關閉角色選擇面板
    const prompt = document.querySelector('.character-interaction-prompt');
    if (prompt) {
        prompt.remove();
    }
    
    // 設置當前互動角色並打開新的互動窗口
    currentCharacterInFacility = characterName;
    openInteractionModal();
}

// ===== 劇情選單功能 =====

/**
 * 打開劇情選單
 */
function openInteractionModal() {
    const modal = document.getElementById('interactionModal');
    const title = document.getElementById('interactionTitle');
    const locationText = document.getElementById('interactionLocationText');
    
    if (!modal || !locationText || !title) {
        return;
    }
    
    title.textContent = `為 ${currentCharacterInFacility} 開啟劇情`;
    const districtName = DISTRICTS[currentDistrict]?.name || '未知區域';
    const facilityName = DISTRICTS[currentDistrict]?.facilities[currentFacility]?.name || '未知設施';
    locationText.textContent = `地點: ${districtName} - ${facilityName}`;

    modal.classList.add('active');
}

/**
 * 關閉劇情選單
 */
function closeInteractionModal() {
    const modal = document.getElementById('interactionModal');
    if (modal) {
        modal.classList.remove('active');
    }
    
    selectedAtmosphere = '';
    const userInput = document.getElementById('userInputForStory');
    if(userInput) userInput.value = '';

    const atmosphereOptions = document.querySelectorAll('#atmosphereOptions .time-option');
    if(atmosphereOptions) atmosphereOptions.forEach(option => option.classList.remove('selected'));
}

/**
 * 確認生成劇情 (Enhanced Version - With official API integration)
 */
async function confirmStoryGeneration() {
    try {
        const userInput = document.getElementById('userInputForStory').value.trim();
    
    // 【修正】重新檢查選中的氣氛選項
    const selectedOption = document.querySelector('#atmosphereOptions .time-option.selected');
    const currentSelectedAtmosphere = selectedOption ? selectedOption.dataset.atmosphere : selectedAtmosphere;
    
    if (!currentSelectedAtmosphere) {
        if (window.MapUtils) window.MapUtils.showNotification('請選擇故事氣氛！');
        return;
    }
    if (!currentCharacterInFacility) {
        if (window.MapUtils) window.MapUtils.showNotification('未檢測到角色！');
        return;
    }

    closeInteractionModal();
    if (window.MapUtils) window.MapUtils.showLoading(true);

    const facilityName = DISTRICTS[currentDistrict]?.facilities[currentFacility]?.name || currentFacility;
    
    // 使用重新檢查的氣氛值
    let command = `故事選單規畫師，參考地理位置。 ${currentCharacterInFacility} 在 ${facilityName} 的故事。`;
    command += `\n故事氣氛：${currentSelectedAtmosphere}。`;
    if (userInput) {
        command += `\n額外說明：${userInput}`;
    }
    command += `\n請以此為基礎，生成3個可能的故事選項，參考其他角色地理位置編寫，不可出現不合理瞬移，或者牽強理由移動位置。`;

    const fullCommand = `/send "${command}" | /trigger "故事選單規畫師"`;
    
    try {
        // 嘗試使用官方API優先發送命令 (Enhanced Version - Multiple fallbacks)
        const officialAPI = getOfficialAPI();
        let commandSent = false;
        
        // 方案1: 優先使用TavernHelper API
        if (officialAPI.TavernHelper?.triggerSlash) {
            try {
                const result = await officialAPI.TavernHelper.triggerSlash(fullCommand);
                commandSent = true;
            } catch (thError) {
                // 继续尝试其他方案
            }
        }
        
        // 方案2: 使用SillyTavern官方API
        if (!commandSent && officialAPI.SillyTavern?.executeSlashCommandsWithOptions) {
            try {
                await officialAPI.SillyTavern.executeSlashCommandsWithOptions(fullCommand);
                commandSent = true;
            } catch (stError) {
                // 继续尝试其他方案
            }
        }
        
        // 方案3: 使用MapUtils備用方案
        if (!commandSent && window.MapUtils?.sendCommandToChat) {
            try {
                await window.MapUtils.sendCommandToChat(fullCommand);
                commandSent = true;
            } catch (mapError) {
                // 继续尝试其他方案
            }
        }
        
        if (!commandSent) {
            throw new Error('所有API方案都失敗，無可用的命令發送方法');
        }
        
    } catch (error) {
        if (window.MapUtils) {
            window.MapUtils.showLoading(false);
            window.MapUtils.showNotification('命令發送失敗：' + error.message);
        }
    }
    
    // 設置超時處理
    setTimeout(() => {
        const storyModal = document.getElementById('storySelectionModal');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay && !loadingOverlay.classList.contains('hidden') && 
            (!storyModal || !storyModal.classList.contains('active'))) {
            if (window.MapUtils) {
                window.MapUtils.showLoading(false);
                window.MapUtils.showNotification('故事生成超時，請重試或檢查AI狀態。');
            }
        }
    }, 15000);
    } catch (outerError) {
        if (window.MapUtils) {
            window.MapUtils.showLoading(false);
            window.MapUtils.showNotification('故事生成失敗，請重試');
        }
    }
}
// ===== 設施數據管理 =====

/**
 * 獲取區域的所有設施（包括自定義設施，排除已刪除設施）
 */
function getAllFacilities(district) {
    const defaultFacilities = DISTRICTS[district]?.facilities || {};
    const customDistrictFacilities = customFacilities[district] || {};
    const deletedDistrictFacilities = deletedFacilities[district] || {};
    
    // 合併設施但排除已刪除的設施
    const allFacilities = { ...defaultFacilities, ...customDistrictFacilities };
    
    // 移除已刪除的設施
    Object.keys(deletedDistrictFacilities).forEach(facilityId => {
        if (deletedDistrictFacilities[facilityId]) {
            delete allFacilities[facilityId];
        }
    });
    
    return allFacilities;
}

// ===== 拖動功能 =====

/**
 * 拖動模式切換 (Enhanced Version - With performance monitoring)
 */
function toggleDragMode() {
    try {
        isDragMode = !isDragMode;
        const container = document.getElementById('facilityIconsContainer');
        const btn = document.getElementById('dragModeBtn');
    
        if (isDragMode) {
            if (container) container.classList.add('drag-mode');
            if (btn) {
                btn.classList.add('drag-active');
                btn.innerHTML = '💾';
                btn.title = '保存位置';
            }
            if (window.MapUtils) {
                window.MapUtils.showNotification('拖動模式已啟用，可以拖動設施圖標調整位置');
            }
        } else {
            if (container) container.classList.remove('drag-mode');
            if (btn) {
                btn.classList.remove('drag-active');
                btn.innerHTML = '✋';
                btn.title = '拖動編輯';
            }

            // 【修复】退出拖动模式时强制保存，并增加多重保障
            console.log('[拖动模式] 退出，开始保存数据...');
            
            if (window.MapUtils && typeof window.MapUtils.saveToStorage === 'function') {
                try {
                    window.MapUtils.saveToStorage();
                    console.log('[拖动模式] 数据保存成功');
                    if (window.MapUtils.showNotification) {
                        window.MapUtils.showNotification('設施位置已保存！');
                    }
                } catch (error) {
                    console.error('[拖动模式] 保存失败:', error);
                    if (window.MapUtils.showNotification) {
                        window.MapUtils.showNotification('保存失敗，請重試！', 'error');
                    }
                }
            } else {
                console.error('[拖动模式] MapUtils.saveToStorage 不可用');
                if (window.MapUtils && window.MapUtils.showNotification) {
                    window.MapUtils.showNotification('錯誤：保存功能遺失！', 'error');
                }
            }
            
            // 【新增】额外保障：直接调用localStorage保存
            try {
                const dataToSave = {
                    facilityPositions: facilityPositions,
                    customFacilities: window.MapArea?.getCustomFacilities() || {},
                    deletedFacilities: window.MapArea?.getDeletedFacilities() || {}
                };
                localStorage.setItem('map_panel_data', JSON.stringify(dataToSave));
                console.log('[拖动模式] 直接localStorage保存完成');
            } catch (directError) {
                console.error('[拖动模式] 直接保存也失败:', directError);
            }
        }
    } catch (error) {
        if (window.MapUtils) {
            window.MapUtils.showNotification('拖動模式切換失敗');
        }
    }
}

/**
 * 初始化拖動事件
 */
function initializeDragEvents() {
    const container = document.getElementById('facilityIconsContainer');
    if (!container) return;
    
    const touchOptions = { passive: false };

    container.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);

    container.addEventListener('touchstart', startDrag, touchOptions);
    document.addEventListener('touchmove', drag, touchOptions);
    document.addEventListener('touchend', endDrag);
}

/**
 * 開始拖動
 */
function startDrag(e) {
    if (!isDragMode) return;
    const target = e.target.closest('.facility-icon-item');
    if (!target) return;

    e.preventDefault();
    isDragging = true;
    draggedElement = target;

    const touch = e.touches ? e.touches[0] : e;

    dragStartCursor = { x: touch.clientX, y: touch.clientY };
    elementStartPos = { x: draggedElement.offsetLeft, y: draggedElement.offsetTop };
    currentCursorPos = { ...dragStartCursor };

    draggedElement.classList.add('dragging');
    animationFrameId = requestAnimationFrame(updatePosition);
}

/**
 * 拖動過程
 */
function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    currentCursorPos = { x: touch.clientX, y: touch.clientY };
}

/**
 * 更新拖動位置
 */
function updatePosition() {
    if (!isDragging) return;

    const deltaX = currentCursorPos.x - dragStartCursor.x;
    const deltaY = currentCursorPos.y - dragStartCursor.y;

    draggedElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.2) rotate(5deg)`;

    animationFrameId = requestAnimationFrame(updatePosition);
}

/**
 * 結束拖動 (MODIFIED)
 */
function endDrag(e) {
    if (!isDragging) return;

    cancelAnimationFrame(animationFrameId);
    draggedElement.classList.remove('dragging');

    const container = document.getElementById('facilityIconsContainer');
    const containerRect = container.getBoundingClientRect();

    const deltaX = currentCursorPos.x - dragStartCursor.x;
    const deltaY = currentCursorPos.y - dragStartCursor.y;
    
    let finalX = elementStartPos.x + deltaX;
    let finalY = elementStartPos.y + deltaY;
    
    const iconSize = draggedElement.offsetWidth;
    finalX = Math.max(0, Math.min(finalX, containerRect.width - iconSize));
    finalY = Math.max(0, Math.min(finalY, containerRect.height - iconSize));

    const leftPercent = (finalX / containerRect.width) * 100;
    const topPercent = (finalY / containerRect.height) * 100;

    // 1. 在更新位置前，暫時禁用過渡動畫，防止"彈跳"
    draggedElement.style.transition = 'none';

    draggedElement.style.left = `${leftPercent}%`;
    draggedElement.style.top = `${topPercent}%`;
    draggedElement.style.transform = '';

    // 2. 為了讓 hover 等效果的過渡動畫恢復正常
    setTimeout(() => {
        if (draggedElement) {
            draggedElement.style.transition = '';
        }
    }, 50);

    // 儲存新位置
    const facilityId = draggedElement.dataset.facilityId;
    if (facilityId) {
        if (!facilityPositions[currentDistrict]) {
            facilityPositions[currentDistrict] = {};
        }
        facilityPositions[currentDistrict][facilityId] = {
            left: leftPercent,
            top: topPercent
        };
        
        console.log(`[拖动] 保存设施 ${facilityId} 位置:`, facilityPositions[currentDistrict][facilityId]);
        
        // 【核心修复】立即强制保存到localStorage，绕过所有中间层
        const saveData = () => {
            try {
                // 获取当前所有数据
                const currentData = JSON.parse(localStorage.getItem('map_panel_data') || '{}');
                
                // 更新设施位置数据
                currentData.facilityPositions = facilityPositions;
                if (window.MapArea?.getCustomFacilities) {
                    currentData.customFacilities = window.MapArea.getCustomFacilities();
                }
                if (window.MapArea?.getDeletedFacilities) {
                    currentData.deletedFacilities = window.MapArea.getDeletedFacilities();
                }
                
                // 强制保存
                localStorage.setItem('map_panel_data', JSON.stringify(currentData));
                console.log(`[拖动] 强制保存成功，数据:`, currentData);
                return true;
            } catch (error) {
                console.error(`[拖动] 强制保存失败:`, error);
                return false;
            }
        };
        
        // 立即保存
        if (!saveData()) {
            // 如果失败，延迟重试
            setTimeout(saveData, 100);
        }
    }
    
    isDragging = false;
    draggedElement = null;
}

// ===== 設施設置功能 =====

/**
 * 打開設施設置模態窗口
 */
function openFacilitySettings() {
    const modal = document.getElementById('facilitySettingsModal');
    const title = document.getElementById('facilitySettingsTitle');
    
    if (!modal || !title) return;
    
    title.textContent = `${DISTRICTS[currentDistrict].name} - 設施設置`;
    updateExistingFacilitiesList();
    modal.classList.add('active');
}

/**
 * 關閉設施設置模態窗口
 */
function closeFacilitySettings() {
    const modal = document.getElementById('facilitySettingsModal');
    if (modal) {
        modal.classList.remove('active');
    }
    
    // 清空輸入
    const nameInput = document.getElementById('newFacilityName');
    if (nameInput) nameInput.value = '';
    
    document.querySelectorAll('.emoji-option').forEach(option => {
        option.classList.remove('selected');
    });
    selectedEmoji = '☕';
    const defaultOption = document.querySelector('[data-emoji="☕"]');
    if (defaultOption) defaultOption.classList.add('selected');
}

/**
 * 更新現有設施列表
 */
function updateExistingFacilitiesList() {
    const container = document.getElementById('existingFacilitiesList');
    if (!container) return;
    
    const defaultFacilities = DISTRICTS[currentDistrict]?.facilities || {};
    const customDistrictFacilities = customFacilities[currentDistrict] || {};
    const deletedDistrictFacilities = deletedFacilities[currentDistrict] || {};
    
    container.innerHTML = '';
    
    // 顯示當前設施
    const activeFacilities = getAllFacilities(currentDistrict);
    Object.entries(activeFacilities).forEach(([facilityId, facility]) => {
        const isCustom = customDistrictFacilities[facilityId];
        
        const facilityItem = document.createElement('div');
        facilityItem.className = 'facility-item';
        facilityItem.innerHTML = `
            <div class="facility-item-info">
                <div class="facility-item-name">${facility.icon} ${facility.name}</div>
                <div class="facility-item-type">${isCustom ? '自定義設施' : '預設設施'}</div>
            </div>
            <div class="facility-item-actions">
                <button class="facility-item-btn edit" onclick="editFacility('${facilityId}')" title="編輯位置">📍</button>
                <button class="facility-item-btn delete" onclick="deleteFacility('${facilityId}')" title="刪除">🗑️</button>
            </div>
        `;
        container.appendChild(facilityItem);
    });
    
    // 顯示已刪除的預設設施
    const deletedDefaultFacilities = Object.keys(deletedDistrictFacilities).filter(id => 
        deletedDistrictFacilities[id] && defaultFacilities[id]
    );
    
    if (deletedDefaultFacilities.length > 0) {
        const deletedTitle = document.createElement('div');
        deletedTitle.className = 'facility-list-title';
        deletedTitle.style.cssText = `
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
        `;
        deletedTitle.innerHTML = '<span>可重新添加的預設設施</span>';
        container.appendChild(deletedTitle);
        
        deletedDefaultFacilities.forEach(facilityId => {
            const facility = defaultFacilities[facilityId];
            const facilityItem = document.createElement('div');
            facilityItem.className = 'facility-item';
            facilityItem.style.opacity = '0.6';
            facilityItem.innerHTML = `
                <div class="facility-item-info">
                    <div class="facility-item-name">${facility.icon} ${facility.name}</div>
                    <div class="facility-item-type">已刪除的預設設施</div>
                </div>
                <div class="facility-item-actions">
                    <button class="facility-item-btn edit" onclick="restoreFacility('${facilityId}')" title="重新添加" style="background: rgba(46, 204, 113, 0.2); color: #2ecc71;">➕</button>
                </div>
            `;
            container.appendChild(facilityItem);
        });
    }
}

/**
 * 新增設施
 */
function addNewFacility() {
    const nameInput = document.getElementById('newFacilityName');
    if (!nameInput) return;
    
    const facilityName = nameInput.value.trim();
    
    if (!facilityName) {
        if (window.MapUtils) {
            window.MapUtils.showNotification('請輸入設施名稱！');
        }
        return;
    }

    if (!selectedEmoji) {
        if (window.MapUtils) {
            window.MapUtils.showNotification('請選擇設施圖標！');
        }
        return;
    }

    // 生成設施ID
    const facilityId = facilityName.replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fff]/g, '');
    
    // 檢查是否已存在
    const allFacilities = getAllFacilities(currentDistrict);
    if (allFacilities[facilityId]) {
        if (window.MapUtils) {
            window.MapUtils.showNotification('設施名稱已存在！');
        }
        return;
    }

    // 創建自定義設施
    if (!customFacilities[currentDistrict]) {
        customFacilities[currentDistrict] = {};
    }

    customFacilities[currentDistrict][facilityId] = {
        name: facilityName,
        icon: selectedEmoji,
        shortName: facilityName.length > 4 ? facilityName.substring(0, 4) : facilityName,
        className: `facility-custom-${facilityId}`,
        characters: [],
        isCustom: true,
        imageUrl: `${BASE_BACKGROUNDS_URL}${facilityName}.jpeg`
    };

    // 設置默認位置
    const defaultPosition = {
        top: Math.random() * 60 + 20,
        left: Math.random() * 60 + 20
    };
    
    if (!facilityPositions[currentDistrict]) {
        facilityPositions[currentDistrict] = {};
    }
    facilityPositions[currentDistrict][facilityId] = defaultPosition;

    // 保存並更新
    if (window.MapUtils) {
        window.MapUtils.saveToStorage();
    }

    updateExistingFacilitiesList();
    showFacilities(currentDistrict);

    // 清空輸入
    nameInput.value = '';
    if (window.MapUtils) {
        window.MapUtils.showNotification(`設施「${facilityName}」新增成功！`);
    }
}

/**
 * 編輯設施
 */
function editFacility(facilityId) {
    editingFacilityId = facilityId;
    const allFacilities = getAllFacilities(currentDistrict);
    const facility = allFacilities[facilityId];
    
    if (!facility) {
        if (window.MapUtils) {
            window.MapUtils.showNotification('設施不存在！');
        }
        return;
    }

    const isCustom = customFacilities[currentDistrict] && customFacilities[currentDistrict][facilityId];
    
    const modal = document.getElementById('facilityEditModal');
    const title = document.getElementById('facilityEditTitle');
    const nameInput = document.getElementById('editFacilityName');
    const imageUrlGroup = document.getElementById('editImageUrlGroup');
    const imageUrlInput = document.getElementById('editFacilityImageUrl');
    
    if (!modal) return;
    
    if (title) title.textContent = isCustom ? '編輯自定義設施' : '編輯預設設施';
    if (nameInput) nameInput.value = facility.name;
    
    editSelectedEmoji = facility.icon;
    
    // 設置emoji選擇
    document.querySelectorAll('#editEmojiSelector .emoji-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.emoji === facility.icon) {
            option.classList.add('selected');
        }
    });
    
    // 圖片URL輸入
    if (imageUrlGroup && imageUrlInput) {
        if (isCustom) {
            imageUrlGroup.style.display = 'block';
            imageUrlInput.value = facility.imageUrl || '';
        } else {
            imageUrlGroup.style.display = 'none';
        }
    }
    
    modal.classList.add('active');
}

/**
 * 刪除設施
 */
function deleteFacility(facilityId) {
    const isCustom = customFacilities[currentDistrict] && customFacilities[currentDistrict][facilityId];
    const isDefault = DISTRICTS[currentDistrict]?.facilities[facilityId];
    
    let confirmMessage = '';
    if (isCustom) {
        confirmMessage = '確定要刪除這個自定義設施嗎？';
    } else if (isDefault) {
        confirmMessage = '確定要刪除這個預設設施嗎？（可以在設施列表中重新添加）';
    }
    
    if (confirm(confirmMessage)) {
        if (isCustom) {
            delete customFacilities[currentDistrict][facilityId];
        } else if (isDefault) {
            if (!deletedFacilities[currentDistrict]) {
                deletedFacilities[currentDistrict] = {};
            }
            deletedFacilities[currentDistrict][facilityId] = true;
        }
        
        // 清除位置數據
        if (facilityPositions[currentDistrict]) {
            delete facilityPositions[currentDistrict][facilityId];
        }
        
        if (window.MapUtils) {
            window.MapUtils.saveToStorage();
        }
        
        updateExistingFacilitiesList();
        showFacilities(currentDistrict);
        
        if (window.MapUtils) {
            window.MapUtils.showNotification('設施已刪除');
        }
    }
}

/**
 * 重新添加已刪除的預設設施
 */
function restoreFacility(facilityId) {
    if (deletedFacilities[currentDistrict] && deletedFacilities[currentDistrict][facilityId]) {
        delete deletedFacilities[currentDistrict][facilityId];
        
        if (Object.keys(deletedFacilities[currentDistrict]).length === 0) {
            delete deletedFacilities[currentDistrict];
        }
        
        if (window.MapUtils) {
            window.MapUtils.saveToStorage();
        }
        
        updateExistingFacilitiesList();
        showFacilities(currentDistrict);
        
        if (window.MapUtils) {
            window.MapUtils.showNotification('預設設施已重新添加');
        }
    }
}

/**
 * 關閉編輯模態窗口
 */
function closeFacilityEdit() {
    const modal = document.getElementById('facilityEditModal');
    if (modal) {
        modal.classList.remove('active');
    }
    
    editingFacilityId = '';
    editSelectedEmoji = '☕';
    
    const nameInput = document.getElementById('editFacilityName');
    const imageInput = document.getElementById('editFacilityImageUrl');
    
    if (nameInput) nameInput.value = '';
    if (imageInput) imageInput.value = '';
    
    document.querySelectorAll('#editEmojiSelector .emoji-option').forEach(option => {
        option.classList.remove('selected');
    });
}

/**
 * 保存編輯後的設施
 */
function saveEditedFacility() {
    const nameInput = document.getElementById('editFacilityName');
    if (!nameInput) return;
    
    const newName = nameInput.value.trim();
    
    if (!newName) {
        if (window.MapUtils) {
            window.MapUtils.showNotification('請輸入設施名稱！');
        }
        return;
    }

    if (!editSelectedEmoji) {
        if (window.MapUtils) {
            window.MapUtils.showNotification('請選擇設施圖標！');
        }
        return;
    }

    const allFacilities = getAllFacilities(currentDistrict);
    const facility = allFacilities[editingFacilityId];
    const isCustom = customFacilities[currentDistrict] && customFacilities[currentDistrict][editingFacilityId];
    
    if (isCustom) {
        const imageUrlInput = document.getElementById('editFacilityImageUrl');
        const imageUrl = imageUrlInput ? imageUrlInput.value.trim() : '';
        
        customFacilities[currentDistrict][editingFacilityId] = {
            ...facility,
            name: newName,
            icon: editSelectedEmoji,
            shortName: newName.length > 4 ? newName.substring(0, 4) : newName,
            imageUrl: imageUrl || facility.imageUrl
        };
        
        if (window.MapUtils) {
            window.MapUtils.showNotification('自定義設施已更新！');
        }
    } else {
        // 編輯預設設施 - 創建一個覆蓋版本
        if (!customFacilities[currentDistrict]) {
            customFacilities[currentDistrict] = {};
        }
        
        customFacilities[currentDistrict][editingFacilityId] = {
            ...facility,
            name: newName,
            icon: editSelectedEmoji,
            shortName: newName.length > 4 ? newName.substring(0, 4) : newName,
            isCustom: true,
            isEditedDefault: true,
            imageUrl: `${BASE_BACKGROUNDS_URL}${newName}.jpeg`
        };
        
        if (window.MapUtils) {
            window.MapUtils.showNotification('預設設施已自定義編輯！');
        }
    }
    
    // 保存並更新界面
    if (window.MapUtils) {
        window.MapUtils.saveToStorage();
    }
    updateExistingFacilitiesList();
    showFacilities(currentDistrict);
    closeFacilityEdit();
}

/**
 * 保存設施設置
 */
function saveFacilitySettings() {
    if (window.MapUtils) {
        window.MapUtils.saveToStorage();
    }
    closeFacilitySettings();
    if (window.MapUtils) {
        window.MapUtils.showNotification('設施設置已保存');
    }
}

// ===== 事件監聽器設置 =====

/**
 * 設置時間選擇事件
 */
function setupTimeSelectionEvents() {
    document.querySelectorAll('.time-option').forEach(option => {
        option.onclick = () => {
            document.querySelectorAll('.time-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedTime = option.dataset.time;
        };
    });
}

/**
 * 設置表情符號選擇事件
 */
function setupEmojiSelectionEvents() {
    // 編輯模態窗口的表情符號選擇
    document.querySelectorAll('#editEmojiSelector .emoji-option').forEach(option => {
        option.onclick = () => {
            document.querySelectorAll('#editEmojiSelector .emoji-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            editSelectedEmoji = option.dataset.emoji;
        };
    });

    // 新增設施的表情符號選擇
    document.querySelectorAll('#emojiSelector .emoji-option').forEach(option => {
        option.onclick = () => {
            document.querySelectorAll('#emojiSelector .emoji-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedEmoji = option.dataset.emoji;
        };
    });

    // 預設選擇咖啡表情
    const defaultOption = document.querySelector('#emojiSelector [data-emoji="☕"]');
    if (defaultOption) {
        defaultOption.classList.add('selected');
    }
}

/**
 * 設置模態窗口外部點擊關閉事件 (CORRECTED - Uses new modal ID)
 */
function setupModalCloseEvents() {
    const facilitySettingsModal = document.getElementById('facilitySettingsModal');
    if (facilitySettingsModal) {
        facilitySettingsModal.addEventListener('click', (e) => {
            if (e.target === facilitySettingsModal) closeFacilitySettings();
        });
    }

    const facilityEditModal = document.getElementById('facilityEditModal');
    if (facilityEditModal) {
        facilityEditModal.addEventListener('click', (e) => {
            if (e.target === facilityEditModal) closeFacilityEdit();
        });
    }

    // --- 修正處：將監聽的目標從舊的 storyModal 改為新的 interactionModal ---
    const interactionModal = document.getElementById('interactionModal');
    if (interactionModal) {
        interactionModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeInteractionModal();
            }
        });
    }
}

/**
 * 設置鍵盤快捷鍵
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const facilityEditModal = document.getElementById('facilityEditModal');
            const facilitySettingsModal = document.getElementById('facilitySettingsModal');
            const storySelectionModal = document.getElementById('storySelectionModal');
            const interactionModal = document.getElementById('interactionModal'); // 使用新ID
            
            if (facilityEditModal?.classList.contains('active')) {
                closeFacilityEdit();
            } else if (facilitySettingsModal?.classList.contains('active')) {
                closeFacilitySettings();
            } else if (storySelectionModal?.classList.contains('active')) {
                storySelectionModal.classList.remove('active');
            } else if (interactionModal?.classList.contains('active')) {
                // --- 修正處：呼叫新的關閉函式 ---
                closeInteractionModal();
            }
        } else if (e.key === 'h' || e.key === 'H') {
            // 回家快捷鍵
            if (!document.querySelector('.modal.active, .facility-settings-modal.active, .facility-edit-modal.active')) {
                goHome();
            }
        } else if (e.key === 'm' || e.key === 'M') {
            // 地圖切換快捷鍵
            if (!document.querySelector('.modal.active, .facility-settings-modal.active, .facility-edit-modal.active')) {
                toggleView();
            }
        } else if (e.key === 'd' || e.key === 'D') {
            // 拖動模式切換快捷鍵
            if (currentView === 'facility' && !document.querySelector('.modal.active, .facility-settings-modal.active, .facility-edit-modal.active')) {
                toggleDragMode();
            }
        }
    });
}

// ===== 初始化函數 =====

/**
 * 初始化地圖區域功能
 */
function initAreaFeatures() {
    // 【核心修复】立即加载保存的数据
    const loadSavedData = () => {
        try {
            const savedData = localStorage.getItem('map_panel_data');
            if (savedData) {
                const data = JSON.parse(savedData);
                console.log('[初始化] 加载保存的数据:', data);
                
                // 恢复设施位置数据
                if (data.facilityPositions) {
                    facilityPositions = data.facilityPositions;
                    console.log('[初始化] 恢复设施位置:', facilityPositions);
                }
                
                // 恢复自定义设施数据
                if (data.customFacilities && window.MapArea?.setCustomFacilities) {
                    window.MapArea.setCustomFacilities(data.customFacilities);
                }
                
                // 恢复已删除设施数据
                if (data.deletedFacilities && window.MapArea?.setDeletedFacilities) {
                    window.MapArea.setDeletedFacilities(data.deletedFacilities);
                }
                
                return true;
            }
        } catch (error) {
            console.error('[初始化] 加载数据失败:', error);
        }
        return false;
    };
    
    // 立即尝试加载
    loadSavedData();
    
    // 为新的互動窗口設置事件
    document.querySelectorAll('#atmosphereOptions .time-option').forEach(option => {
        option.onclick = () => {
            document.querySelectorAll('#atmosphereOptions .time-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedAtmosphere = option.dataset.atmosphere;
            if (window.MapUtils) {
                window.MapUtils.showNotification(`已選擇氣氛：${selectedAtmosphere}`);
            }
        };
    });

    const interactionModal = document.getElementById('interactionModal');
    if (interactionModal) {
        interactionModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeInteractionModal();
            }
        });
    }

    // 舊的事件監聽器
    setupEmojiSelectionEvents();
    setupModalCloseEvents();
    setupKeyboardShortcuts();
    initializeDragEvents();
    
    // 【保留】页面卸载前强制保存数据（不卡，只在关闭时执行一次）
    const forceSave = () => {
        try {
            const currentData = JSON.parse(localStorage.getItem('map_panel_data') || '{}');
            currentData.facilityPositions = facilityPositions;
            if (window.MapArea?.getCustomFacilities) {
                currentData.customFacilities = window.MapArea.getCustomFacilities();
            }
            if (window.MapArea?.getDeletedFacilities) {
                currentData.deletedFacilities = window.MapArea.getDeletedFacilities();
            }
            localStorage.setItem('map_panel_data', JSON.stringify(currentData));
            console.log('[页面卸载] 强制保存完成');
        } catch (error) {
            console.error('[页面卸载] 保存失败:', error);
        }
    };
    
    window.addEventListener('beforeunload', forceSave);
    window.addEventListener('unload', forceSave);
    
    // 【移除了定期保存，避免卡顿】
}


// ===== 全局API暴露 (CORRECTED - Exposes new functions) =====
window.MapArea = {
    init: initAreaFeatures,
    toggleView: toggleView,
    goHome: goHome,
    showFacilities: showFacilities,
    enterFacility: enterFacility,
    getCurrentView: () => currentView,
    getCurrentLocation: () => ({
        view: currentView,
        location: currentLocation,
        district: currentDistrict,
        facility: currentFacility
    }),
    clearCharacterPrompts: clearCharacterPrompts,
    showCharacterClickPrompt: showCharacterClickPrompt,
    showMultipleCharacterClickPrompt: showMultipleCharacterClickPrompt,
    selectCharacterForInteraction: selectCharacterForInteraction,
    
    // --- 修正處：暴露新的函式名稱，移除舊的 ---
    openInteractionModal: openInteractionModal,
    closeInteractionModal: closeInteractionModal,
    confirmStoryGeneration: confirmStoryGeneration, // 雖然功能改變，但名稱暫時保留以減少修改
    
    setCurrentCharacterInFacility: (character) => { currentCharacterInFacility = character; },
    getCurrentCharacterInFacility: () => currentCharacterInFacility,
    
    // ... (其他API保持不變) ...
    toggleDragMode: toggleDragMode,
    openFacilitySettings: openFacilitySettings,
    closeFacilitySettings: closeFacilitySettings,
    addNewFacility: addNewFacility,
    editFacility: editFacility,
    deleteFacility: deleteFacility,
    restoreFacility: restoreFacility,
    closeFacilityEdit: closeFacilityEdit,
    saveEditedFacility: saveEditedFacility,
    saveFacilitySettings: saveFacilitySettings,
    getAllFacilities: getAllFacilities,
    updateCurrentFacilityDisplay: updateCurrentFacilityDisplay,
    loadLocationBackground: loadLocationBackground,
    getCustomFacilities: () => ({ ...customFacilities }),
    setCustomFacilities: (facilities) => { customFacilities = facilities || {}; },
    getFacilityPositions: () => ({ ...facilityPositions }),
    setFacilityPositions: (positions) => { facilityPositions = positions || {}; },
    getDeletedFacilities: () => ({ ...deletedFacilities }),
    setDeletedFacilities: (deleted) => { deletedFacilities = deleted || {}; },
    
};

// 地圖區域核心模塊已載入

// 移除页面加载后的自动加载逻辑，因为它已经包含在 initAreaFeatures 中
// if (document.readyState === 'loading') { ... } else { ... }