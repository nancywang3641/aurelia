// ----------------------------------------------------------------
// [地圖] map_icons.js
// 職責：地圖上區域／設施／地標的圖示統一用 Font Awesome。
//   ① 生成世界時叫 AI 從 GROUPS 這張清單挑英文名（promptList() 給提示詞用），不再寫 emoji。
//   ② 畫的時候一律過 html()：清單裡的名字 → 圖示；舊世界存的 emoji → 查 EMOJI 換成對應圖示；
//      都認不出來 → 定位針。所以舊資料不用重生，打開就是新的樣子。
//   ③ 場景小地圖的地標（scene_map_engine）AI 還是寫 emoji 開頭，也是在這裡換。
// 🚨 清單裡的名字都在 FA 6.4 免費版驗過存在；要加新的先確認，不然會畫出空白。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // 給 AI 挑的清單（分組只是讓它好找，程式不看分組）
    const GROUPS = {
        '建築': 'building city house house-chimney hotel warehouse industry tower-observation tower-broadcast building-columns landmark monument archway building-shield building-lock tower-cell dungeon chess-rook crown',
        '信仰': 'church mosque synagogue torii-gate place-of-worship gopuram vihara person-praying cross yin-yang dharmachakra',
        '學習醫療': 'school graduation-cap book book-open scroll hospital house-medical kit-medical stethoscope pills syringe flask vial mortar-pestle dna atom brain',
        '商店': 'shop store cart-shopping basket-shopping bag-shopping sack-dollar coins gem money-bill-wave vault piggy-bank ticket',
        '吃喝': 'utensils bowl-food mug-hot mug-saucer martini-glass wine-glass wine-bottle whiskey-glass beer-mug-empty champagne-glasses cake-candles ice-cream pizza-slice burger bread-slice cookie fish shrimp',
        '娛樂': 'masks-theater music guitar microphone headphones film camera gamepad dice chess palette paintbrush futbol dumbbell bowling-ball golf-ball-tee spa hot-tub-person bath person-swimming umbrella-beach',
        '交通': 'anchor ship sailboat ferry bridge road train train-subway bus car truck motorcycle bicycle gas-pump plane helicopter jet-fighter rocket shuttle-space satellite satellite-dish',
        '自然': 'tree tree-city seedling leaf wheat-awn tractor horse paw crow dove cat dog frog spider bug mountain mountain-sun volcano water snowflake cloud bolt wind fire campground tent tents',
        '奇幻': 'dragon hat-wizard wand-magic-sparkles star moon sun meteor eye skull ghost bone feather-pointed key lock door-open ring heart',
        '危險': 'shield-halved khanda hand-fist gun crosshairs bomb handcuffs gavel scale-balanced user-secret radiation biohazard dumpster-fire',
        '科技': 'microchip server robot laptop desktop phone gears hammer wrench oil-well magnet plug lightbulb recycle newspaper briefcase people-group user-tie user-astronaut',
        '其他': 'globe earth-asia map compass flag location-dot magnifying-glass sign-hanging chair bed couch bell clock box-archive boxes-stacked hurricane'
    };
    const NAMES = {};
    Object.keys(GROUPS).forEach(g => GROUPS[g].split(/\s+/).forEach(n => { if (n) NAMES[n] = 1; }));

    // 舊世界存的 emoji → 圖示（AI 常寫的那些；沒列到的畫定位針）
    const EMOJI = {
        '🏢': 'building', '🏬': 'store', '🏙': 'city', '🏙️': 'city', '🌆': 'city', '🌃': 'city', '🏘': 'house-chimney', '🏘️': 'house-chimney', '🏠': 'house', '🏡': 'house', '🏚': 'house-chimney', '🏚️': 'house-chimney',
        '🏨': 'hotel', '🏩': 'hotel', '🏭': 'industry', '🏗': 'building', '🏗️': 'building', '🗼': 'tower-observation', '🏛': 'building-columns', '🏛️': 'building-columns', '🏟': 'landmark', '🏟️': 'landmark',
        '🏰': 'chess-rook', '🏯': 'torii-gate', '⛩': 'torii-gate', '⛩️': 'torii-gate', '⛪': 'church', '🕌': 'mosque', '🕍': 'synagogue', '🛕': 'gopuram', '🗽': 'monument', '🗿': 'monument', '👑': 'crown',
        '🏫': 'school', '🎓': 'graduation-cap', '📚': 'book', '📖': 'book-open', '📜': 'scroll', '🏥': 'hospital', '💊': 'pills', '🧪': 'flask', '⚗': 'flask', '⚗️': 'flask', '🔬': 'microchip', '🧬': 'dna',
        '🛒': 'cart-shopping', '🛍': 'bag-shopping', '🛍️': 'bag-shopping', '💰': 'sack-dollar', '💎': 'gem', '🪙': 'coins', '💵': 'money-bill-wave', '💸': 'money-bill-wave', '🏦': 'building-columns', '🎫': 'ticket', '🎟': 'ticket', '🎟️': 'ticket',
        '🍽': 'utensils', '🍽️': 'utensils', '🍜': 'bowl-food', '🍲': 'bowl-food', '🍱': 'bowl-food', '☕': 'mug-hot', '🍵': 'mug-hot', '🍸': 'martini-glass', '🍷': 'wine-glass', '🍾': 'wine-bottle', '🥃': 'whiskey-glass',
        '🍺': 'beer-mug-empty', '🍻': 'beer-mug-empty', '🥂': 'champagne-glasses', '🎂': 'cake-candles', '🍰': 'cake-candles', '🍦': 'ice-cream', '🍕': 'pizza-slice', '🍔': 'burger', '🍞': 'bread-slice', '🥐': 'bread-slice', '🍪': 'cookie', '🐟': 'fish', '🐠': 'fish', '🦐': 'shrimp',
        '🎭': 'masks-theater', '🎵': 'music', '🎶': 'music', '🎸': 'guitar', '🎤': 'microphone', '🎧': 'headphones', '🎬': 'film', '🎥': 'film', '📷': 'camera', '🎮': 'gamepad', '🕹': 'gamepad', '🕹️': 'gamepad', '🎲': 'dice', '🎰': 'dice', '🃏': 'dice', '♟': 'chess', '♟️': 'chess',
        '🎨': 'palette', '⚽': 'futbol', '🏋': 'dumbbell', '🏋️': 'dumbbell', '🥊': 'hand-fist', '🎳': 'bowling-ball', '⛳': 'golf-ball-tee', '💆': 'spa', '♨': 'hot-tub-person', '♨️': 'hot-tub-person', '🛁': 'bath', '🏊': 'person-swimming', '🏖': 'umbrella-beach', '🏖️': 'umbrella-beach',
        '⚓': 'anchor', '🚢': 'ship', '⛴': 'ferry', '⛴️': 'ferry', '🛥': 'ship', '🛥️': 'ship', '⛵': 'sailboat', '🌉': 'bridge', '🛣': 'road', '🛣️': 'road', '🚉': 'train', '🚂': 'train', '🚇': 'train-subway', '🚌': 'bus', '🚗': 'car', '🚚': 'truck',
        '🏍': 'motorcycle', '🏍️': 'motorcycle', '🚲': 'bicycle', '⛽': 'gas-pump', '✈': 'plane', '✈️': 'plane', '🚁': 'helicopter', '🚀': 'rocket', '🛸': 'shuttle-space', '🛰': 'satellite', '🛰️': 'satellite', '📡': 'satellite-dish',
        '🌳': 'tree', '🌲': 'tree', '🌴': 'tree', '🌱': 'seedling', '🌿': 'leaf', '🍃': 'leaf', '🌾': 'wheat-awn', '🚜': 'tractor', '🐎': 'horse', '🐴': 'horse', '🐾': 'paw', '🐦': 'dove', '🕊': 'dove', '🕊️': 'dove', '🐈': 'cat', '🐱': 'cat', '🐕': 'dog', '🐶': 'dog', '🐸': 'frog', '🕷': 'spider', '🕷️': 'spider', '🐛': 'bug',
        '⛰': 'mountain', '⛰️': 'mountain', '🏔': 'mountain', '🏔️': 'mountain', '🗻': 'mountain-sun', '🌋': 'volcano', '🌊': 'water', '💧': 'water', '❄': 'snowflake', '❄️': 'snowflake', '☁': 'cloud', '☁️': 'cloud', '⚡': 'bolt', '🌪': 'wind', '🌪️': 'wind', '🔥': 'fire', '🏕': 'campground', '🏕️': 'campground', '⛺': 'tent',
        '🐉': 'dragon', '🐲': 'dragon', '🧙': 'hat-wizard', '🔮': 'hat-wizard', '✨': 'wand-magic-sparkles', '🪄': 'wand-magic-sparkles', '⭐': 'star', '🌟': 'star', '🌙': 'moon', '☀': 'sun', '☀️': 'sun', '☄': 'meteor', '☄️': 'meteor', '👁': 'eye', '👁️': 'eye',
        '💀': 'skull', '☠': 'skull', '☠️': 'skull', '👻': 'ghost', '🦴': 'bone', '🪶': 'feather-pointed', '🗝': 'key', '🗝️': 'key', '🔑': 'key', '🔒': 'lock', '🚪': 'door-open', '💍': 'ring', '❤': 'heart', '❤️': 'heart', '💓': 'heart', '💗': 'heart',
        '🛡': 'shield-halved', '🛡️': 'shield-halved', '⚔': 'khanda', '⚔️': 'khanda', '🗡': 'khanda', '🗡️': 'khanda', '🔫': 'gun', '🎯': 'crosshairs', '💣': 'bomb', '🚔': 'building-shield', '👮': 'building-shield', '⚖': 'scale-balanced', '⚖️': 'scale-balanced', '🕵': 'user-secret', '🕵️': 'user-secret', '🤫': 'user-secret',
        '☢': 'radiation', '☢️': 'radiation', '☣': 'biohazard', '☣️': 'biohazard', '🩸': 'hand-fist', '🪝': 'anchor',
        '💻': 'laptop', '🖥': 'desktop', '🖥️': 'desktop', '📱': 'phone', '🤖': 'robot', '⚙': 'gears', '⚙️': 'gears', '🔧': 'wrench', '🔨': 'hammer', '🛢': 'oil-well', '🛢️': 'oil-well', '💡': 'lightbulb', '📰': 'newspaper', '💼': 'briefcase', '👥': 'people-group',
        '🌍': 'earth-asia', '🌏': 'earth-asia', '🌎': 'earth-asia', '🌐': 'globe', '🗺': 'map', '🗺️': 'map', '🧭': 'compass', '🚩': 'flag', '📍': 'location-dot', '📌': 'location-dot', '📦': 'box-archive', '🌀': 'hurricane', '🔍': 'magnifying-glass', '🔎': 'magnifying-glass', '🪧': 'sign-hanging', '🪑': 'chair', '🛏': 'bed', '🛏️': 'bed', '🛋': 'couch', '🛋️': 'couch', '🔔': 'bell', '🕰': 'clock', '🕰️': 'clock'
    };

    function isName(s) { return !!NAMES[String(s || '').replace(/^fa-/, '')]; }

    // 任何來源的圖示值 → 一顆 <i>（名字、fa-名字、emoji 都吃；認不出來就是定位針）
    function name(v) {
        const s = String(v || '').trim();
        if (!s) return 'location-dot';
        const bare = s.replace(/^fa-(solid\s+fa-)?/, '');
        if (NAMES[bare]) return bare;
        if (EMOJI[s]) return EMOJI[s];
        const noVs = s.replace(/\uFE0F/g, '');
        if (EMOJI[noVs]) return EMOJI[noVs];
        return 'location-dot';
    }
    function html(v) { return '<i class="fa-solid fa-' + name(v) + '"></i>'; }

    // 給生成世界的提示詞：整張清單，一行一組
    function promptList() {
        return Object.keys(GROUPS).map(g => '  ' + g + '：' + GROUPS[g].split(/\s+/).join(' ')).join('\n');
    }

    win.MAP_ICONS = { GROUPS, EMOJI, isName, name, html, promptList };
    if (win !== window) window.MAP_ICONS = win.MAP_ICONS;
})();
