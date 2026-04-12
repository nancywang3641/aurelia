// ----------------------------------------------------------------
// [檔案] map_data.js (V2.0 - Github Assets)
// 路徑：scripts/os_phone/map/map_data.js
// 職責：儲存奧瑞亞地圖數據、GitHub 圖片連結、設施詳情
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入奧瑞亞地圖數據庫 (V2.0)...');

    // 完整的區域數據結構
    const AUREALIS_DB = {
        'A': {
            name: 'Solarium 日暉區',
            background: 'https://nancywang3641.github.io/sound-files/location_img/A區_日暉區.jpg',
            facilities: {
                'Stellar_Nexus': { 
                    sceneId: 'A_Stellar_Nexus',
                    name: 'Stellar Nexus 總部', icon: '🏢', shortName: '總部', className: 'facility-stellar', characters: [], 
                    imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Stellar_Nexus.jpeg',
                    keywords: ['Stellar Nexus', '總部', '技術研發區', '企業戰略區', '高層辦公區', '產品開發實驗室']
                },
                'MYCIA_Mall': { sceneId: 'A_MYCIA_Mall', name: 'MYCIA 商場', icon: '🛍️', shortName: '商場', className: 'facility-mycia', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_MYCIA_商場.jpeg' },
                'Ion_Root': { sceneId: 'A_Ion_Root', name: 'Ion Root 能源核心塔', icon: '⚡', shortName: '能源塔', className: 'facility-ion-root', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_IonRoot_能源核心塔.jpeg' },
                'Lumen_Loop': { sceneId: 'A_Lumen_Loop', name: 'Lumen Loop 轉運中樞站', icon: '🚇', shortName: '轉運站', className: 'facility-lumen-loop', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_LumenLoop_轉運中樞站.jpeg' },
                'Solarium_Tower': { sceneId: 'A_Solarium_Tower', name: 'Solarium 安全塔總署', icon: '🛡️', shortName: '安全塔', className: 'facility-solarium-tower', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Solarium_安全塔總署.jpeg' },
                'Aegis_Link': { sceneId: 'A_Aegis_Link', name: 'Aegis Link', icon: '🔗', shortName: '連結', className: 'facility-aegis-link', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_AegisLink.jpeg' },
                'Citadel_Tower': { sceneId: 'A_Citadel_Tower', name: 'Citadel 中央情報塔', icon: '🗼', shortName: '情報塔', className: 'facility-citadel', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Citadel_中央情報塔.jpeg' },
                'Orion_Global': { sceneId: 'A_Orion_Global', name: 'Orion Global', icon: '🌍', shortName: '全球', className: 'facility-orion', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_OrionGlobal.jpeg' },
                'Sky_Duct': { sceneId: 'A_Sky_Duct', name: 'Sky Duct 空氣處理塔', icon: '🌬️', shortName: '空氣塔', className: 'facility-sky-duct', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_SkyDuct_空氣處理塔.jpeg' },
                'Solaris_Apex': { sceneId: 'A_Solaris_Apex', name: 'Solaris Apex', icon: '🌟', shortName: '頂點', className: 'facility-solaris', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_Solaris_Apex.jpeg' },
                'Commerce_District': { sceneId: 'A_Commerce_District', name: '商業街區', icon: '🏬', shortName: '商業街', className: 'facility-commerce', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/A區_MYCIA_商場.jpeg' }
            }
        },
        'B': {
            name: 'Nocturne 夜韻街區',
            background: 'https://nancywang3641.github.io/sound-files/char_home/B%E5%8D%80_%E5%A4%9C%E9%9F%BB%E8%A1%97%E5%8D%80.jpg',
            facilities: {
                'LUXA_DOME': { sceneId: 'B_LUXA_DOME', name: 'LUXA 路克薩巨蛋', icon: '🎭', shortName: '巨蛋', className: 'facility-luxa', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_LUXA_DOME_路克薩巨蛋.jpeg' },
                'Echo_Veil': { sceneId: 'B_Echo_Veil', name: 'Echo Veil 迴音紗劇院', icon: '🎪', shortName: '劇院', className: 'facility-echo-veil', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_EchoVeil_回音紗劇院.jpeg' },
                'NOVA_Mall': { sceneId: 'B_NOVA_Mall', name: 'NOVA 百貨環廊', icon: '🛒', shortName: '百貨', className: 'facility-nova-mall', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_NOVA_百貨環廊.jpeg' },
                'Decibel_Ruins': { sceneId: 'B_Decibel_Ruins', name: '聲波廢墟俱樂部', icon: '🎵', shortName: '俱樂部', className: 'facility-decibel', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_聲波廢墟俱樂部.jpeg' },
                'HYPEWALL': { sceneId: 'B_HYPEWALL', name: 'HYPEWALL 脈衝牆', icon: '⚡', shortName: '脈衝牆', className: 'facility-hypewall', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_HYPEWALL_脈衝牆.jpeg' },
                'Graffiti_Buildings': { sceneId: 'B_Graffiti_Buildings', name: '塗鴉樓群', icon: '🎨', shortName: '塗鴉樓', className: 'facility-graffiti', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_塗鴉樓群.jpeg' },
                'Energy_Column': { sceneId: 'B_Energy_Column', name: '能源循環柱', icon: '🔋', shortName: '能源柱', className: 'facility-energy', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_能源循環柱.jpeg' },
                'B_Street_24': { sceneId: 'B_B_Street_24', name: '24號街', icon: '🏠', shortName: '24號街', className: 'facility-b-street', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_B街24.jpeg' },
                'Night_Market': { sceneId: 'B_Night_Market', name: '夜市核心區', icon: '🌃', shortName: '夜市', className: 'facility-night-market', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_夜市核心區.jpeg' },
                'Nocturne_Library': { sceneId: 'B_Nocturne_Library', name: 'Nocturne 圖書街', icon: '📚', shortName: '圖書街', className: 'facility-library', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_Nocturne_圖書街.jpeg' },
                'Nocturne_Arena': { sceneId: 'B_Nocturne_Arena', name: 'Nocturne Arena 夜韻競技館', icon: '🏟️', shortName: '競技館', className: 'facility-arena', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_Nocturne Arena_夜韻競技館.jpeg' },
                'B_Lite_Node': { sceneId: 'B_B_Lite_Node', name: 'B-Lite Node 捷運站', icon: '🚆', shortName: '捷運站', className: 'facility-b-lite', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_B-Lite_Node_捷運站.jpeg' },
                'Nocturne_Police': { sceneId: 'B_Nocturne_Police', name: 'Nocturne 公安分局', icon: '👮', shortName: '公安', className: 'facility-police', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_Nocturne_公安分局.jpeg' },
                'Cafe_District': { sceneId: 'B_Cafe_District', name: '特色餐飲街', icon: '🍽️', shortName: '餐飲街', className: 'facility-cafe-district', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_不眠咖啡.jpeg' },
                'Residential_Zone': { sceneId: 'B_Residential_Zone', name: '住宅區', icon: '🏘️', shortName: '住宅區', className: 'facility-residential-zone', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/B區_艾迪_創意青年公寓.jpeg' }
            }
        },
        'C': {
            name: 'Horizon 地平綠域',
            background: 'https://nancywang3641.github.io/sound-files/location_img/C區_地平綠域.jpg',
            facilities: {
                'Hebe_Fountain': { name: '赫柏噴泉', icon: '⛲', shortName: '噴泉', className: 'facility-hebe', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_赫柏噴泉.jpeg' },
                'Civic_Hall': { name: 'Civic Hall 公民廳', icon: '🏛️', shortName: '公民廳', className: 'facility-civic', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_CivicHall_公民厅.jpeg' },
                'Horizon_Medical': { name: 'C-Med 綜合醫院', icon: '🏥', shortName: '醫院', className: 'facility-horizon-medical', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_C-Med_綜合醫院.jpeg' },
                'Central_Library': { name: '中央圖書館', icon: '📚', shortName: '圖書館', className: 'facility-central-library', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_地平綠域.jpg' },
                'City_Museum': { name: '都市博物館', icon: '🏛️', shortName: '博物館', className: 'facility-museum', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_都市博物館.jpeg' },
                'Light_Square': { name: '光語廣場', icon: '✨', shortName: '光語', className: 'facility-light-square', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_光語廣場.jpeg' },
                'Daily_Market': { name: '日常市集角', icon: '🛒', shortName: '市集', className: 'facility-daily-market', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_日常市集角.jpeg' },
                'Green_Corridor': { name: '綠映回廊', icon: '🌿', shortName: '回廊', className: 'facility-green', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_綠映回廊.jpeg' },
                'Council_Hall': { name: '地平議會館', icon: '🏛️', shortName: '議會館', className: 'facility-council', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_地平議會館.jpeg' },
                'Education_District': { name: '教育區', icon: '🎓', shortName: '教育區', className: 'facility-education-district', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_市立教育語盟小學.jpeg' },
                'Residential_Zone': { name: '住宅區', icon: '🏘️', shortName: '住宅區', className: 'facility-residential-zone', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_C-Ring_生活住宅群.jpeg' },
                'Community_Center': { name: '社區活動區', icon: '🏟️', shortName: '活動區', className: 'facility-community-center', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/C區_地平綠域.jpg' }
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
                'Crux_Vault': { name: 'Crux Vault', icon: '🔒', shortName: '金庫', className: 'facility-crux', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_CruxVault.jpeg' },
                'D_FORT': { name: 'D-FORT 應變小組站', icon: '🛡️', shortName: '應變站', className: 'facility-d-fort', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_D-FORT_應變小組站.jpeg' },
                'Sky_Dome_Port': { name: 'Sky Dome Port Extension', icon: '🚁', shortName: '空港', className: 'facility-sky-dome', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_SkyDome_Port_Extension.jpeg' },
                'Platinum_Promenade': { name: '白金長廊', icon: '💎', shortName: '白金長廊', className: 'facility-platinum', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg' },
                'Knight_Club': { name: '騎士俱樂部', icon: '⚔️', shortName: '騎士俱樂部', className: 'facility-knight', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg' },
                'Emerald_Golf': { name: '翡翠高爾夫', icon: '⛳', shortName: '高爾夫', className: 'facility-emerald', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg' },
                'Diamond_Marina': { name: '鑽石遊艇碼頭', icon: '🛥️', shortName: '遊艇碼頭', className: 'facility-diamond', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg' },
                'Noble_Social_Club': { name: '貴族社交會所', icon: '🍷', shortName: '社交會所', className: 'facility-noble', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg' },
                'Private_Gallery': { name: '私人美術館', icon: '🖼️', shortName: '美術館', className: 'facility-gallery', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg' },
                'Ivory_Elementary': { name: '象牙小學', icon: '🏫', shortName: '小學', className: 'facility-ivory-elementary', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg' },
                'Ivory_Middle_School': { name: '象牙中學', icon: '🏫', shortName: '中學', className: 'facility-ivory-middle', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg' },
                'Ivory_High_School': { name: '象牙國際高中', icon: '🏫', shortName: '高中', className: 'facility-ivory-school', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_象牙國際高中.jpeg' },
                'Royal_Art_Academy': { name: '皇家藝術學院', icon: '🎨', shortName: '藝術學院', className: 'facility-royal-art', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/D%E5%8D%80_%E8%B1%A1%E7%89%99%E9%AB%98%E5%9C%B0.jpg' },
                'Shadow_Street': { name: '亡影街', icon: '👻', shortName: '亡影街', className: 'facility-shadow-street', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_亡影街.jpeg' },
                'Revival_Clinic': { name: '復生診所', icon: '⚕️', shortName: '復生', className: 'facility-revival', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_復生診所.jpeg' },
                'Death_Corridor': { name: '死線走道', icon: '💀', shortName: '死線', className: 'facility-death', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_死線走道.jpeg' },
                'X_Kernel_Lab': { name: 'X-Kernel Lab', icon: '🧪', shortName: 'X實驗室', className: 'facility-x-kernel', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_X-Kernel_Lab.jpeg' },
                'Unmarked_Police': { name: '無標警署', icon: '🕵️', shortName: '警署', className: 'facility-unmarked', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_無標警署.jpeg' },
                'Wealth_Center': { name: '秘密財富管理中心', icon: '💰', shortName: '財富', className: 'facility-wealth', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_秘密財富管理中心.jpeg' },
                'Ivory_Data_Tower': { name: '象牙數據塔', icon: '💽', shortName: '數據塔', className: 'facility-ivory-data', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_象牙數據塔.jpeg' },
                'Manor_District': { name: '豪宅區', icon: '🏰', shortName: '豪宅區', className: 'facility-manor-district', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/D區_雷伊_隱私海濱別墅.jpeg' }
            }
        },
        'E': {
            name: 'Spirehollow 空塔街坊',
            background: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg',
            facilities: {
                'Wreckspire': { name: 'Wreckspire', icon: '🗗️', shortName: '崩塔', className: 'facility-wreckspire', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_Wreckspire.jpeg' },
                'Crimson_Cellar': { name: 'Crimson Cellar 深紅窖', icon: '🍷', shortName: '深紅窖', className: 'facility-crimson-cellar-d', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_Crimson_Cellar_深紅窖.jpeg' },
                'Shadow_Furnace': { name: 'Shadow Furnace 影熔爐', icon: '🔥', shortName: '熔爐', className: 'facility-shadow-furnace', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_ShadowFurnace_影熔爐.jpeg' },
                'Glitch_Dome': { name: 'Glitch Dome 錯位圓頂', icon: '⚡', shortName: '圓頂', className: 'facility-glitch-dome', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_GlitchDome_錯位圓頂.jpeg' },
                'Phantom_Synapse': { name: 'Phantom Synapse 幻神經核', icon: '🧠', shortName: '神經核', className: 'facility-phantom-synapse', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_PhantomSynapse_幻神經核.jpeg' },
                'Hollow_Choir': { name: 'Hollow Choir 虛合唱團', icon: '🎵', shortName: '合唱團', className: 'facility-hollow-choir', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_HollowChoir_虛合唱團.jpeg' },
                'Mirage_Court': { name: 'Mirage Court 幻庭', icon: '🏭', shortName: '幻庭', className: 'facility-mirage', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_MirageCourt_幻庭.jpeg' },
                'Mute_Vault': { name: 'Mute Vault 沉默庫', icon: '🔇', shortName: '沉默庫', className: 'facility-mute', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_MuteVault_沉默庫.jpeg' },
                'Null_Sanctuary': { name: 'Null Sanctuary 無號庇所', icon: '🏚️', shortName: '庇所', className: 'facility-null', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_NullSanctuary_無號庇所.jpeg' },
                'Pulse_Street': { name: 'Pulse Street 脈動街', icon: '💓', shortName: '脈動街', className: 'facility-pulse-street', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_PulseStreet_脈動街.jpeg' },
                'Silent_Haven': { name: 'Silent Haven 靜隱', icon: '🤫', shortName: '靜隱', className: 'facility-silent', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_SilentHaven_靜隱.jpeg' },
                'Veinpath': { name: 'Veinpath 靜脈道', icon: '🩸', shortName: '靜脈道', className: 'facility-veinpath', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/location_img/E區_Veinpath_靜脈道.jpeg' },
                'Blood_Arena': { name: '血腥競技場', icon: '⚔️', shortName: '競技場', className: 'facility-blood', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg' },
                'Death_Roulette': { name: '死亡輪盤賭場', icon: '🎰', shortName: '賭場', className: 'facility-roulette', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg' },
                'Living_Market': { name: '活體市場', icon: '💀', shortName: '活體市場', className: 'facility-living', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg' },
                'Flesh_Cage': { name: '肉籠', icon: '🔞', shortName: '肉籠', className: 'facility-flesh', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg' },
                'Mist_Den': { name: '迷霧巢穴', icon: '💉', shortName: '迷霧巢穴', className: 'facility-mist', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg' },
                'Dream_Workshop': { name: '幻夢工坊', icon: '🧪', shortName: '幻夢工坊', className: 'facility-dream', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg' },
                'Tin_City': { name: '鐵皮城', icon: '🏚️', shortName: '鐵皮城', className: 'facility-tin', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg' },
                'Mod_Workshop': { name: '改造作坊', icon: '🔧', shortName: '改造作坊', className: 'facility-mod', characters: [], imageUrl: 'https://nancywang3641.github.io/sound-files/char_home/E%E5%8D%80_%E7%A9%BA%E5%A1%94%E8%A1%97%E5%9D%8A.jpg' }
            }
        }
    };

    // 掛載到全局
    window.AUREALIS_DATA = {
        zones: AUREALIS_DB,
        
        // 獲取指定區域的數據
        getZone: function(zoneId) {
            return AUREALIS_DB[zoneId];
        },
        
        // 獲取所有區域ID
        getZoneIds: function() {
            return Object.keys(AUREALIS_DB);
        }
    };

    console.log(`[AurealisData] 已加載 ${Object.keys(AUREALIS_DB).length} 個區域配置`);
})();