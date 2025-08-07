
    document.addEventListener('DOMContentLoaded', () => {

        // ===================================================================
        // 1. 所有变量和常量定义
        // ===================================================================
        const db = new Dexie('GeminiChatDB');
        // --- 已修正 ---
        let state = { chats: {}, activeChatId: null, globalSettings: {}, apiConfig: {}, imageConfig: {}, userStickers: [], worldBooks: [], personaPresets: [], qzoneSettings: {}, activeAlbumId: null };
        // --- 修正结束 ---
        let musicState = { isActive: false, activeChatId: null, isPlaying: false, playlist: [], currentIndex: -1, playMode: 'order', totalElapsedTime: 0, timerId: null };
        const audioPlayer = document.getElementById('audio-player');
        let newWallpaperBase64 = null;
        let isSelectionMode = false;
        let selectedMessages = new Set();
        let editingMemberId = null;
        let editingFrameForMember = false;
        let editingWorldBookId = null;
        let editingPersonaPresetId = null;

let waimaiTimers = {}; // 用于存储外卖倒计时

let activeMessageTimestamp = null;
let activePostId = null; // <-- 新增：用于存储当前操作的动态ID

        let photoViewerState = {
            isOpen: false,
            photos: [], // 存储当前相册的所有照片URL
            currentIndex: -1, // 当前正在查看的照片索引
        };

        let unreadPostsCount = 0;

        let isFavoritesSelectionMode = false;
        let selectedFavorites = new Set()

let simulationIntervalId = null;

const frameModal = document.getElementById('avatar-frame-modal');
const aiFrameTab = document.getElementById('ai-frame-tab');
const myFrameTab = document.getElementById('my-frame-tab');
const aiFrameContent = document.getElementById('ai-frame-content');
const myFrameContent = document.getElementById('my-frame-content');
const aiFrameGrid = document.getElementById('ai-frame-grid');
const myFrameGrid = document.getElementById('my-frame-grid');

        const defaultAvatar = 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
        const defaultMyGroupAvatar = 'https://i.postimg.cc/cLPP10Vm/4.jpg';
        const defaultGroupMemberAvatar = 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
        const defaultGroupAvatar = 'https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg';
        let notificationTimeout;

const npcAvatarPool = {
    'anime_boy': [ 'https://i.postimg.cc/pL5505fT/image.png', 'https://i.postimg.cc/8CKdY2z4/image.png' ],
    'anime_girl': [ 'https://i.postimg.cc/PqgqfH7S/image.png', 'https://i.postimg.cc/Z5pCY9tQ/image.png' ],
    'cat': [ 'https://i.postimg.cc/d11x6HKZ/image.png', 'https://i.postimg.cc/VL1gLgV3/image.png' ],
    'professional': [ 'https://i.postimg.cc/13yXhJg9/image.png', 'https://i.postimg.cc/W34kKFN5/image.png'],
    'pixel_art': [ 'https://i.postimg.cc/VvF0tGgG/image.png', 'https://i.postimg.cc/wMPyS8bB/image.png' ]
};

        const avatarFrames = [ { id: 'none', url: '', name: '无' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/fLDnz5Pn/IMG-5574.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/HxH3cNHz/IMG-6871.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/jCVK0fGL/IMG-6890.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/85Zsyjwn/IMG-6895.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/cJtpZCB3/IMG-6894.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/63sDQKMm/IMG-6893.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/cHQPgzj4/IMG-6888.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/dVLXm3Xf/IMG-6885.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/kGsZwbq0/IMG-6886.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/63NmX03s/IMG-4366.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/zvz2LGK0/IMG-4367.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/prsGKMBx/IMG-4370.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/gk0BmrY0/IMG-4371.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/fRt2SFSn/IMG-4368.gif', name: '14' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/kGgwJhPH/IMG-4374.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/PrcKH436/IMG-4376.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/fRV86FMq/IMG-4381.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/HsyqMVyk/IMG-4385.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/qBbKK7dS/IMG-4386.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/05wnd389/IMG-4388.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/RZNLhbbr/IMG-4389.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/fLTc42dg/IMG-4391.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/FzbGNdRT/IMG-4392.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/XY63sTS3/IMG-4393.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/Cx9vCVWH/IMG-4395.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/kMfPQBwQ/IMG-4396.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/CLrZQMMD/IMG-4398.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/L4zwDhTC/IMG-4399.gif', name: '14' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/yN3s8szM/IMG-4400.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/59Cn1tkB/IMG-4401.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/g0s1V0PX/IMG-4402.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/Jn1DFPgY/IMG-4403.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/q7cQnDy1/IMG-4404.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/RFK3q2t0/IMG-4407.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/gcV0VR2t/IMG-4408.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/W1CjLb4J/IMG-4409.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/Ss7pM6fW/IMG-4410.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/nrFfYX3N/IMG-4412.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/cHWp0KG6/IMG-4413.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/4yNjHrdg/IMG-4414.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/hPX5F8Qp/IMG-4415.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/vHCSG1WM/IMG-4416.gif', name: '14' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/x1Hp80Rm/IMG-4417.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/FHRcCGfH/IMG-4418.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/13hhJ77p/IMG-4419.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/J4WCQd2j/IMG-4420.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/Dydkpd9H/IMG-4421.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/mrkvDxPW/IMG-4422.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/76Tj3g1B/IMG-4425.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/3N5Vndn3/IMG-4426.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/05DLr0yj/IMG-4427.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/GhR6DT4Q/IMG-4428.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/fRTF24jS/IMG-4430.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/R0WYmcYM/IMG-4431.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/nrJSqNhz/IMG-4432.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/tC9mJ0cv/IMG-4438.gif', name: '14' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/XNkQTHvf/IMG-5561.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/Mpv5fzm5/IMG-4439.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/T1tjhsyB/IMG-4720.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/c4JMPd2W/IMG-4724.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/g2XykNGB/IMG-4727.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/y8MmJcd6/IMG-4728.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/Lsjzj5Yt/IMG-4729.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/bNdk33SN/IMG-4893.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/4x9tTy1D/IMG-5563.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/DZshzKv6/IMG-5576.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/Fsvr71JL/IMG-5573.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/Fz3HwLk9/IMG-5569.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/wjH180kn/IMG-5566.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/MG6qtLYK/IMG-5565.gif', name: '14' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/CKgDNYVb/IMG-5577.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/hj4dkrvj/IMG-5578.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/hj4dkrvj/IMG-5578.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/C5XnfpNB/IMG-5579.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/4y7mGFgJ/IMG-5716.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/FzM1Hgr0/IMG-5717.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/rF4KYbjj/IMG-5720.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/6pLTBvDG/IMG-5721.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/VNK6Ccsf/IMG-5722.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/wx72fhr2/IMG-5968.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/QdrqdvdY/IMG-5969.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/0yd0MZ6k/IMG-5971.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/1zmcp66p/IMG-5973.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/wBw5Fvcn/IMG-5974.gif', name: '14' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/R0pfKYvB/IMG-5976.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/9fQZ425b/IMG-5975.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/v8V9xXjJ/IMG-6137.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/WbmkXzsS/IMG-6138.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/Dw2bDhZh/IMG-6140.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/ZqQBCyLY/IMG-6144.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/qRCtnMms/IMG-6145.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/1Rwn3XVP/IMG-6146.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/Kv51tW5H/IMG-6147.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/nhcC21Rc/IMG-6148.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/fTWzQRx8/IMG-6149.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/LXyyqDbY/IMG-6294.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/7Zgm1wRy/IMG-6295.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/5tbpnDcQ/IMG-6296.gif', name: '14' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/YSRRV8kn/IMG-6297.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/k45sd8gn/IMG-6375.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/50k390X8/IMG-6376.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/90RBDh9K/IMG-6377.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/cCpBYbMH/IMG-6552.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/Pf9g2fSL/IMG-6554.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/gkhf597g/IMG-6555.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/g2PfbSFm/IMG-6556.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/pLY3WfR8/IMG-6557.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/65Cmcr7S/IMG-6559.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/Y94XWYKd/IMG-6560.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/ydwLXx7s/IMG-6562.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/G3y73Fj2/IMG-6563.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/TYvkKKkc/IMG-6565.gif', name: '14' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/GmcqjZn8/IMG-6566.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/k5Gs0K47/IMG-6567.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/XJy8JWdh/IMG-6568.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/fycfcvHf/IMG-6569.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/J7ZxC11H/IMG-6570.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/hPnrSHjy/IMG-4434.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/YqxxjbLp/IMG-6572.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/wjfcQMkZ/IMG-6573.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/Vv8jkCYr/IMG-6574.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/MZ77rdDy/IMG-6850.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/T3NvqJCZ/IMG-6851.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/28TsrxRV/IMG-6852.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/VkV2bLNw/IMG-6853.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/gJ95NSRB/IMG-6854.gif', name: '14' }, { id: 'frame_cat_ear', url: 'https://i.postimg.cc/d1qsQsbQ/IMG-6855.gif', name: '1' }, { id: 'frame_ribbon', url: 'https://i.postimg.cc/gJNYx9pV/IMG-6856.gif', name: '2' }, { id: 'frame_flower', url: 'https://i.postimg.cc/fyPDvxJk/IMG-6860.gif', name: '3' }, { id: 'frame_tech', url: 'https://i.postimg.cc/QMDsSNxg/IMG-6861.gif', name: '4' }, { id: 'frame_5', url: 'https://i.postimg.cc/vBqsQW7X/IMG-6858.gif', name: '5' }, { id: 'frame_6', url: 'https://i.postimg.cc/Y0vwjhb7/IMG-6857.gif', name: '6' }, { id: 'frame_7', url: 'https://i.postimg.cc/90sH9Cn7/IMG-6868.gif', name: '7' }, { id: 'frame_8', url: 'https://i.postimg.cc/Y2PHZzCC/IMG-6866.gif', name: '8' }, { id: 'frame_9', url: 'https://i.postimg.cc/7Z8yYP7v/IMG-6889.gif', name: '9' }, { id: 'frame_10', url: 'https://i.postimg.cc/nryNzTXK/IMG-6915.gif', name: '10' }, { id: 'frame_11', url: 'https://i.postimg.cc/Qx5dqyJ3/IMG-6917.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/Wbr0JSDD/IMG-5316.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/tgR6wjBP/IMG-5570.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/d0WCKxff/IMG-6932.gif', name: '14' }, { id: 'frame_11', url: 'https://i.postimg.cc/Ss3znzk7/IMG-6934.gif', name: '11' }, { id: 'frame_12', url: 'https://i.postimg.cc/nrm9BcL8/IMG-6941.gif', name: '12' }, { id: 'frame_13', url: 'https://i.postimg.cc/ZYvd1jxf/IMG-6937.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/sDFhySn3/IMG-6936.gif', name: '14' }, { id: 'frame_13', url: 'https://i.postimg.cc/43PhvxRq/IMG-6922.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/3Rb46fRZ/IMG-6923.gif', name: '14' }, { id: 'frame_13', url: 'https://i.postimg.cc/PJppkbvn/IMG-6918.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/XqRZNZ9G/IMG-6916.gif', name: '14' }, { id: 'frame_14', url: 'https://i.postimg.cc/RVt6sRzc/IMG-6939.gif', name: '14' }, { id: 'frame_13', url: 'https://i.postimg.cc/mgGc0HbK/IMG-6926.gif', name: '13' }, { id: 'frame_14', url: 'https://i.postimg.cc/P5zLh5JJ/IMG-6942.gif', name: '14' }, { id: 'frame_14', url: 'https://i.postimg.cc/xCqqKGRN/IMG-6929.gif', name: '14' },
      { id: 'frame_12', url: 'https://i.postimg.cc/7LSRp4hx/e7fa949b9pc84cff0dabe57defceb54c.gif', name: '12' },
    { id: 'frame_13', url: 'https://i.postimg.cc/DZgMwc1H/817178fdbpf2ff7740dc98e26ab78759.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/3NffgJSZ/e09c07034ld7e62266c0a5de6a36ae62.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/vHDNGfT2/35ac7f372v588bf48d4f659077196b85.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/KvVsjjgG/3c3aa5219s18b90187ef1f54b3db7ba8.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/k5P1NHcL/55f3e31d8qbc8a02d152b07b99d31567.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/FFCTCzpy/641bad3b3udc599fdb63ca75fde427e5.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/8k7YSLjK/1689aa46aqc4b9ffc0f970e668f56537.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/J0CZSwyW/IMG-6938.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/Df1qLzDf/IMG-6927.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/CLNkrQSW/IMG-6925.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/y8p9s3Jj/IMG-6919.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/Lsr1Zd3Z/IMG-6928.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/Ssgbv41n/IMG-6876.gif', name: '14' },
{ id: 'frame_14', url: 'https://i.postimg.cc/SNByPrf9/IMG-7005.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/Z5nrCyS5/IMG-7006.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/mDfMXXFP/IMG-7007.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/DZrGtrqB/IMG-7008.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/ZnJNZWHZ/IMG-7009.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/RhGH0vpt/IMG-7010.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/tRzPkzRg/IMG-7012.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/wTTNGs3Q/IMG-7013.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/3JSG5Jv5/IMG-7014.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/rwDr8X1d/IMG-7015.gif', name: '14' },
{ id: 'frame_14', url: 'https://i.postimg.cc/DzDy2vS7/IMG-7017.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/QMVdG9x6/IMG-7016.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/mZ9hgH3J/IMG-7019.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/t4ksHGdg/IMG-7020.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/hP9JpdfT/IMG-7023.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/wTKyXVT9/IMG-7024.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/ZqjKXPSv/IMG-7025.gif', name: '14' },

  { id: 'frame_14', url: 'https://i.postimg.cc/gj3Tmqz5/mmexport1751030241029.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/4yCXW52F/mmexport1751030908335.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/VkXngG72/mmexport1751031208329.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/LscBkxZb/mmexport1751017556565.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/1XqzGKwJ/mmexport1751018282681.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/8kHCQwbQ/mmexport1751020645824.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/HWynLK7f/mmexport1751021724230.gif', name: '14' },
{ id: 'frame_14', url: 'https://i.postimg.cc/JnwFp3Kx/mmexport1751031208329.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/HLZNWkQw/mmexport1751031767634.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/vH2X6N1y/mmexport1751032231179.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/NFS4ZyvM/mmexport1751032686953.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/3RpmWc8c/mmexport1751033102811.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/L5RLr3tg/mmexport1751035976943.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/4NCPsp5d/mmexport1751034427637.gif', name: '14' },
{ id: 'frame_14', url: 'https://i.postimg.cc/CMv02LHm/mmexport1751034842120.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/rFnSzWGx/mmexport1751035618517.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/7YRbzN51/mmexport1751036276038.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/cJpbtPWq/mmexport1751036607799.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/HxLV5v92/mmexport1751036977582.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/D01rYy86/mmexport1751037965259.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/J4fwkTLW/mmexport1751038167142.gif', name: '14' },
  
  
{ id: 'frame_14', url: 'https://i.postimg.cc/xjpN4swz/IMG-7240.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/ZnzbGdxX/IMG-7239.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/DyYDmKtw/IMG-7238.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/W40f9qtd/IMG-7098.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/8PsK20jQ/IMG-7236.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/cHsTXDVz/IMG-7235.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/sXwm8Yzg/IMG-7234.gif', name: '14' },
{ id: 'frame_14', url: 'https://i.postimg.cc/xTk5xN49/IMG-7233.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/k5yv6QBv/IMG-7232.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/yx2m4nbs/IMG-7231.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/vZt0fFKn/IMB-r-HMBXY.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/pddJj9zN/IMG-7094.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/rmB17Qbc/IMB-f-VDf-Fc.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/VkKjzYTK/IMB-f4kk-CT.gif', name: '14' },
{ id: 'frame_14', url: 'https://i.postimg.cc/B6KD52vz/IMG-7096.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/9XPwWmwy/IMB-Kf7um-P.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/mrFhKBGz/IMB-e-QWBpa.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/bw4wxW2z/IMB-16r-COL.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/3x0Kx1fz/IMB-K1u-Jp-P.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/CLz0cJ0d/IMG-7116.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/fyyGgW61/IMG-7115.gif', name: '14' },
{ id: 'frame_14', url: 'https://i.postimg.cc/gkk7s0vD/IMG-6984.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/0NpZPgYj/IMG-6985.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/tTWKKmTN/IMG-7073.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/jS8tc9wW/IMG-7083.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/rmRVKJpD/IMG-7087.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/zvWGPjms/IMG-7090.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/YSkqDg8V/IMG-7092.gif', name: '14' },
{ id: 'frame_14', url: 'https://i.postimg.cc/FzqHTBng/IMG-7093.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/tTpZ6wLs/IMG-7095.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/8P5vt8sW/IMG-7097.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/wMxmCZVC/IMG-7099.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/2jxd0FGp/IMG-7100.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/B6T59xGK/IMG-7101.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/kXfcgFRN/IMG-7106.gif', name: '14' },
{ id: 'frame_14', url: 'https://i.postimg.cc/htZppbS4/IMG-7107.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/hPgyjtyn/IMG-7108.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/HLKvs0Kv/IMG-7109.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/wjwbnYkp/IMG-7111.gif', name: '14' },
  { id: 'frame_13', url: 'https://i.postimg.cc/bJDMQVkj/IMG-7112.gif', name: '13' },
    { id: 'frame_14', url: 'https://i.postimg.cc/SNWBTP5S/IMG-7113.gif', name: '14' },
  { id: 'frame_14', url: 'https://i.postimg.cc/jCVMQsKH/IMG-7114.gif', name: '14' },
  
  ];

        let currentFrameSelection = { ai: null, my: null };
        const STICKER_REGEX = /^(https:\/\/i\.postimg\.cc\/.+|https:\/\/files\.catbox\.moe\/.+|data:image)/;
        const MESSAGE_RENDER_WINDOW = 50;
        let currentRenderedCount = 0;
        let lastKnownBatteryLevel = 1;
        let alertFlags = { hasShown40: false, hasShown20: false, hasShown10: false };
        let batteryAlertTimeout;
        const dynamicFontStyle = document.createElement('style');
        dynamicFontStyle.id = 'dynamic-font-style';
        document.head.appendChild(dynamicFontStyle);

        const modalOverlay = document.getElementById('custom-modal-overlay');
        const modalTitle = document.getElementById('custom-modal-title');
        const modalBody = document.getElementById('custom-modal-body');
        const modalConfirmBtn = document.getElementById('custom-modal-confirm');
        const modalCancelBtn = document.getElementById('custom-modal-cancel');
        let modalResolve;

        function showCustomModal() { 
            modalOverlay.classList.add('visible'); 
        }

        function hideCustomModal() { 
            modalOverlay.classList.remove('visible'); 
            modalConfirmBtn.classList.remove('btn-danger'); 
            
            // 清除自定義樣式
            modalOverlay.classList.remove('vn-story-details-modal');
            modalOverlay.style.removeProperty('--modal-width');
            modalOverlay.style.removeProperty('--modal-height');
            modalOverlay.style.removeProperty('z-index');
            
            if (modalResolve) modalResolve(null); 
        }

        function showCustomConfirm(title, message, options = {}) {
            return new Promise(resolve => {
                modalResolve = resolve;
                modalTitle.textContent = title;
                modalBody.innerHTML = `<p>${message}</p>`;
                modalCancelBtn.style.display = 'block';
                modalConfirmBtn.textContent = '确定';
                if (options.confirmButtonClass) modalConfirmBtn.classList.add(options.confirmButtonClass);
                modalConfirmBtn.onclick = () => { resolve(true); hideCustomModal(); };
                modalCancelBtn.onclick = () => { resolve(false); hideCustomModal(); };
                showCustomModal();
            });
        }

        function showCustomAlert(title, message, options = {}) {
            return new Promise(resolve => {
                modalResolve = resolve;
                modalTitle.textContent = title;
                modalBody.innerHTML = `<p style="text-align: left; white-space: pre-wrap;">${message}</p>`;
                modalCancelBtn.style.display = 'none';
                modalConfirmBtn.textContent = '好的';
                modalConfirmBtn.onclick = () => {
                    modalCancelBtn.style.display = 'block'; 
                    modalConfirmBtn.textContent = '确定';
                    resolve(true); 
                    hideCustomModal();
                };
                
                // 如果指定了自定義樣式，應用它們
                if (options.customClass) {
                    modalOverlay.classList.add(options.customClass);
                }
                if (options.width) {
                    modalOverlay.style.setProperty('--modal-width', options.width);
                }
                if (options.height) {
                    modalOverlay.style.setProperty('--modal-height', options.height);
                }
                if (options.zIndex) {
                    modalOverlay.style.zIndex = options.zIndex;
                }
                
                showCustomModal();
            });
        }


function showCustomPrompt(title, placeholder, initialValue = '', type = 'text', extraHtml = '') {
    return new Promise(resolve => {
        modalResolve = resolve;
        modalTitle.textContent = title;
        const inputId = 'custom-prompt-input';
        
        const inputHtml = type === 'textarea' 
            ? `<textarea id="${inputId}" placeholder="${placeholder}" rows="4" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 14px; box-sizing: border-box; resize: vertical;">${initialValue}</textarea>`
            : `<input type="${type}" id="${inputId}" placeholder="${placeholder}" value="${initialValue}">`;
        
        // 【核心修改】将额外的HTML和输入框组合在一起
        modalBody.innerHTML = extraHtml + inputHtml;
        const input = document.getElementById(inputId);

        // 【核心修改】为格式助手按钮绑定事件
        modalBody.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const templateStr = btn.dataset.template;
                if (templateStr) {
                    try {
                        const templateObj = JSON.parse(templateStr);
                        // 使用 null, 2 参数让JSON字符串格式化，带缩进，更易读
                        input.value = JSON.stringify(templateObj, null, 2);
                        input.focus();
                    } catch(e) {
                        console.error("解析格式模板失败:", e);
                    }
                }
            });
        });
        
        modalConfirmBtn.onclick = () => { resolve(input.value); hideCustomModal(); };
        modalCancelBtn.onclick = () => { resolve(null); hideCustomModal(); };
        showCustomModal();
        setTimeout(() => input.focus(), 100);
    });
}
// ▲▲▲ 替换结束 ▲▲▲

        // ===================================================================
        // 2. 数据库结构定义
        // ===================================================================

db.version(24).stores({ 
    chats: '&id, isGroup, groupId', 
    apiConfig: '&id', 
    globalSettings: '&id', 
    imageConfig: '&id', // 新增：圖像生成配置
    userStickers: '&id, url, name',
    worldBooks: '&id, name, priority, trigger, keywords, category',
    musicLibrary: '&id', 
    personaPresets: '&id',
    qzoneSettings: '&id',
    qzonePosts: '++id, timestamp', 
    qzoneAlbums: '++id, name, createdAt',
    qzonePhotos: '++id, albumId',
    favorites: '++id, type, timestamp, originalTimestamp',
    qzoneGroups: '++id, name',
    memories: '++id, chatId, timestamp, type, targetDate', // <--【核心】增加 targetDate 索引
    characters: '&id, name', // 新增：人設庫表
    prompts: '++id, type, name, createdAt', // 新增：提示词管理表
    materialImages: '++id, category, name, type, timestamp' // 新增：素材圖片表
});

        // ===================================================================
        // 3. 所有功能函数定义
        // ===================================================================
        
        // 初始化API模塊
        if (window.JCYAPIModule) {
            window.JCYAPIModule.init(state, db);
            console.log('[JCY] API模塊已初始化');
        } else {
            console.warn('[JCY] API模塊未找到，請確保已加載 JCY_API_module.js');
            // 設置一個延遲檢查，以防API模塊稍後加載
            setTimeout(() => {
                if (window.JCYAPIModule) {
                    window.JCYAPIModule.init(state, db);
                    console.log('[JCY] API模塊延遲初始化完成');
                }
            }, 1000);
        }

        // ===================================================================
        // IndexedDB素材圖片管理系統
        // ===================================================================
        
        // 素材圖片管理類
        class MaterialImageManager {
            constructor() {
                this.db = db;
                this.supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                this.maxFileSize = 10 * 1024 * 1024; // 10MB
            }
            
            // 上傳圖片到IndexedDB
            async uploadImage(file, category, name = null) {
                try {
                    // 驗證文件格式
                    if (!this.supportedFormats.includes(file.type)) {
                        throw new Error(`不支持的圖片格式: ${file.type}。支持的格式: ${this.supportedFormats.join(', ')}`);
                    }
                    
                    // 驗證文件大小
                    if (file.size > this.maxFileSize) {
                        throw new Error(`文件太大: ${(file.size / 1024 / 1024).toFixed(2)}MB。最大支持: ${this.maxFileSize / 1024 / 1024}MB`);
                    }
                    
                    // 讀取文件為ArrayBuffer
                    const arrayBuffer = await file.arrayBuffer();
                    
                    // 生成文件名
                    const fileName = name || file.name || `image_${Date.now()}`;
                    
                    // 創建圖片記錄
                    const imageRecord = {
                        category: category,
                        name: fileName,
                        type: file.type,
                        size: file.size,
                        data: arrayBuffer,
                        timestamp: Date.now()
                    };
                    
                    // 保存到IndexedDB
                    const id = await this.db.materialImages.add(imageRecord);
                    
                    console.log(`[素材管理] 圖片上傳成功: ${fileName} (ID: ${id})`);
                    
                    return {
                        id: id,
                        name: fileName,
                        category: category,
                        type: file.type,
                        size: file.size,
                        timestamp: imageRecord.timestamp
                    };
                    
                } catch (error) {
                    console.error('[素材管理] 圖片上傳失敗:', error);
                    throw error;
                }
            }
            
            // 從IndexedDB獲取圖片
            async getImage(id) {
                try {
                    const record = await this.db.materialImages.get(id);
                    if (!record) {
                        throw new Error(`圖片不存在: ${id}`);
                    }
                    
                    // 將ArrayBuffer轉換為Blob URL
                    const blob = new Blob([record.data], { type: record.type });
                    const url = URL.createObjectURL(blob);
                    
                    return {
                        id: record.id,
                        name: record.name,
                        category: record.category,
                        type: record.type,
                        size: record.size,
                        url: url,
                        timestamp: record.timestamp
                    };
                    
                } catch (error) {
                    console.error('[素材管理] 獲取圖片失敗:', error);
                    throw error;
                }
            }
            
            // 獲取分類下的所有圖片
            async getImagesByCategory(category) {
                try {
                    const records = await this.db.materialImages
                        .where('category')
                        .equals(category)
                        .reverse()
                        .sortBy('timestamp');
                    
                    const images = [];
                    for (const record of records) {
                        const blob = new Blob([record.data], { type: record.type });
                        const url = URL.createObjectURL(blob);
                        
                        images.push({
                            id: record.id,
                            name: record.name,
                            category: record.category,
                            type: record.type,
                            size: record.size,
                            url: url,
                            timestamp: record.timestamp
                        });
                    }
                    
                    return images;
                    
                } catch (error) {
                    console.error('[素材管理] 獲取分類圖片失敗:', error);
                    throw error;
                }
            }
            
            // 刪除圖片
            async deleteImage(id) {
                try {
                    const record = await this.db.materialImages.get(id);
                    if (!record) {
                        throw new Error(`圖片不存在: ${id}`);
                    }
                    
                    await this.db.materialImages.delete(id);
                    console.log(`[素材管理] 圖片刪除成功: ${record.name} (ID: ${id})`);
                    
                    return true;
                    
                } catch (error) {
                    console.error('[素材管理] 刪除圖片失敗:', error);
                    throw error;
                }
            }
            
            // 清空分類下的所有圖片
            async clearCategory(category) {
                try {
                    const count = await this.db.materialImages
                        .where('category')
                        .equals(category)
                        .delete();
                    
                    console.log(`[素材管理] 清空分類成功: ${category} (刪除 ${count} 張圖片)`);
                    return count;
                    
                } catch (error) {
                    console.error('[素材管理] 清空分類失敗:', error);
                    throw error;
                }
            }
            
            // 獲取所有圖片統計信息
            async getImageStats() {
                try {
                    const stats = {};
                    const categories = await this.db.materialImages
                        .orderBy('category')
                        .uniqueKeys();
                    
                    for (const category of categories) {
                        const count = await this.db.materialImages
                            .where('category')
                            .equals(category)
                            .count();
                        
                        const totalSize = await this.db.materialImages
                            .where('category')
                            .equals(category)
                            .toArray()
                            .then(records => records.reduce((sum, record) => sum + record.size, 0));
                        
                        stats[category] = {
                            count: count,
                            totalSize: totalSize,
                            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
                        };
                    }
                    
                    return stats;
                    
                } catch (error) {
                    console.error('[素材管理] 獲取統計信息失敗:', error);
                    throw error;
                }
            }
            
            // 釋放Blob URL
            releaseBlobURL(url) {
                if (url && url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            }
            
            // 批量釋放Blob URL
            releaseBlobURLs(urls) {
                if (Array.isArray(urls)) {
                    urls.forEach(url => this.releaseBlobURL(url));
                }
            }
        }
        
        // 創建全局素材圖片管理器實例
        const materialImageManager = new MaterialImageManager();
        window.materialImageManager = materialImageManager;

        function showScreen(screenId) {
            if (screenId === 'chat-list-screen') {
                window.renderChatListProxy(); 
                switchToChatListView('messages-view');
            }
            if (screenId === 'api-settings-screen') {
                if (window.JCYAPIModule && window.JCYAPIModule.renderApiSettings) {
                    window.JCYAPIModule.renderApiSettings();
                } else {
                    console.warn('[JCY] API模塊未加載，無法顯示API設置');
                    // 顯示錯誤提示
                    alert('API模塊正在加載中，請稍後再試');
                    return;
                }
            }
            if (screenId === 'wallpaper-screen') window.renderWallpaperScreenProxy();
            if (screenId === 'world-book-screen') window.renderWorldBookScreenProxy();
            if (screenId === 'prompt-manager-screen') {
                renderPromptManagerScreen();
            }
            if (screenId === 'vn-panel-screen') {
                console.log('[JCY] 切換到VN面板屏幕');
            }
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            const screenToShow = document.getElementById(screenId);
            if (screenToShow) screenToShow.classList.add('active');
            if (screenId === 'chat-interface-screen') window.updateListenTogetherIconProxy(state.activeChatId);
            if (screenId === 'font-settings-screen') {
                document.getElementById('font-url-input').value = state.globalSettings.fontUrl || '';
                applyCustomFont(state.globalSettings.fontUrl || '', true);
            }
        }
        window.updateListenTogetherIconProxy = () => {};

        function switchToChatListView(viewId) {
            const chatListScreen = document.getElementById('chat-list-screen');
            const views = {
                'messages-view': document.getElementById('messages-view'),
                'qzone-screen': document.getElementById('qzone-screen'),
                'favorites-view': document.getElementById('favorites-view'),
        'memories-view': document.getElementById('memories-view') // <-- 新增这一行
    };
            const mainHeader = document.getElementById('main-chat-list-header');
            const mainBottomNav = document.getElementById('chat-list-bottom-nav'); // 获取主导航栏

            if (isFavoritesSelectionMode) {
                document.getElementById('favorites-edit-btn').click(); 
            }

            // 隐藏所有视图
            Object.values(views).forEach(v => v.classList.remove('active'));
            // 显示目标视图
            if (views[viewId]) {
                views[viewId].classList.add('active');
            }

            // 更新底部导航栏高亮
            document.querySelectorAll('#chat-list-bottom-nav .nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.view === viewId);
            });
            
            // ▼▼▼ 【核心修正】在这里统一管理所有UI元素的显隐 ▼▼▼
            if (viewId === 'messages-view') {
                mainHeader.style.display = 'flex';
                mainBottomNav.style.display = 'flex';
            } else {
                mainHeader.style.display = 'none';
                // 保持底部導航欄始終顯示，讓用戶可以切換欄目
                mainBottomNav.style.display = 'flex';
            }
            // ▲▲▲ 修正结束 ▲▲▲

    if (viewId !== 'memories-view') {
        activeCountdownTimers.forEach(timerId => clearInterval(timerId));
        activeCountdownTimers = [];
    }

            // 根据视图ID执行特定的渲染/更新逻辑
            switch (viewId) {
                case 'qzone-screen':
                    views['qzone-screen'].style.backgroundColor = '#f0f2f5';
                    updateUnreadIndicator(0);
                    renderQzoneScreen();
                    renderQzonePosts();
                    break;
                case 'favorites-view':
                    views['favorites-view'].style.backgroundColor = '#f9f9f9';
                    renderFavoritesScreen();
                    break;
                case 'messages-view':
                    // 如果需要，可以在这里添加返回消息列表时要执行的逻辑
                    break;
            }
        }
        
        function renderQzoneScreen() {
            if (state && state.qzoneSettings) {
                const settings = state.qzoneSettings;
                document.getElementById('qzone-nickname').textContent = settings.nickname;
                document.getElementById('qzone-avatar-img').src = settings.avatar;
                document.getElementById('qzone-banner-img').src = settings.banner;
            }
        }
        window.renderQzoneScreenProxy = renderQzoneScreen;

        async function saveQzoneSettings() {
            if (db && state.qzoneSettings) {
                await db.qzoneSettings.put(state.qzoneSettings);
            }
        }

        function formatPostTimestamp(timestamp) {
            if (!timestamp) return '';
            const now = new Date();
            const date = new Date(timestamp);
            const diffSeconds = Math.floor((now - date) / 1000);
            const diffMinutes = Math.floor(diffSeconds / 60);
            const diffHours = Math.floor(diffMinutes / 60);
            if (diffMinutes < 1) return '刚刚';
            if (diffMinutes < 60) return `${diffMinutes}分钟前`;
            if (diffHours < 24) return `${diffHours}小时前`;
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            if (now.getFullYear() === year) {
                return `${month}-${day} ${hours}:${minutes}`;
            } else {
                return `${year}-${month}-${day} ${hours}:${minutes}`;
            }
        }

        async function renderQzonePosts() {
            const postsListEl = document.getElementById('qzone-posts-list');
            if (!postsListEl) return;

            const [posts, favorites] = await Promise.all([
                db.qzonePosts.orderBy('timestamp').reverse().toArray(),
                db.favorites.where('type').equals('qzone_post').toArray() // 获取所有已收藏的动态
            ]);

            // 创建一个已收藏帖子ID的集合，方便快速查找
            const favoritedPostIds = new Set(favorites.map(fav => fav.content.id));
            
            postsListEl.innerHTML = '';

            if (posts.length === 0) {
                postsListEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 30px 0;">这里空空如也，快来发布第一条说说吧！</p>';
                return;
            }

            const userSettings = state.qzoneSettings;

            posts.forEach(post => {
                const postContainer = document.createElement('div');
                postContainer.className = 'qzone-post-container';
                postContainer.dataset.postId = post.id;

                const postEl = document.createElement('div');
                postEl.className = 'qzone-post-item';

                let authorAvatar = '', authorNickname = '', commentAvatar = userSettings.avatar; 

                if (post.authorId === 'user') {
                    authorAvatar = userSettings.avatar;
                    authorNickname = userSettings.nickname;
                } else if (state.chats[post.authorId]) {
                    const authorChat = state.chats[post.authorId];
                    authorAvatar = authorChat.settings.aiAvatar || defaultAvatar;
                    authorNickname = authorChat.name;
                } else {
                    authorAvatar = defaultAvatar;
                    authorNickname = '{{char}}';
                }
                
                let contentHtml = '';
                const publicTextHtml = post.publicText ? `<div class="post-content">${post.publicText.replace(/\n/g, '<br>')}</div>` : '';

                if (post.type === 'shuoshuo') {
                    contentHtml = `<div class="post-content" style="margin-bottom: 10px;">${post.content.replace(/\n/g, '<br>')}</div>`;
                } 
                else if (post.type === 'image_post' && post.imageUrl) {
                    contentHtml = publicTextHtml ? `${publicTextHtml}<div style="margin-top:10px;"><img src="${post.imageUrl}" class="chat-image"></div>` : `<img src="${post.imageUrl}" class="chat-image">`;
                } 
                else if (post.type === 'text_image') {
                    contentHtml = publicTextHtml ? `${publicTextHtml}<div style="margin-top:10px;"><img src="https://i.postimg.cc/KYr2qRCK/1.jpg" class="chat-image" style="cursor: pointer;" data-hidden-text="${post.hiddenContent}"></div>` : `<img src="https://i.postimg.cc/KYr2qRCK/1.jpg" class="chat-image" style="cursor: pointer;" data-hidden-text="${post.hiddenContent}">`;
                }

                let likesHtml = '';
                if (post.likes && post.likes.length > 0) {
                    likesHtml = `<div class="post-likes-section"><svg class="like-icon" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg><span>${post.likes.join('、')} 觉得很赞</span></div>`;
                }
                
                let commentsHtml = '';
                if (post.comments && post.comments.length > 0) {
                    commentsHtml = '<div class="post-comments-container">';
                    post.comments.forEach(comment => {
                        commentsHtml += `<div class="comment-item"><span class="commenter-name">${comment.commenterName}:</span><span class="comment-text">${comment.text}</span></div>`;
                    });
                    commentsHtml += '</div>';
                }

                // 检查点赞和收藏状态
                const userNickname = state.qzoneSettings.nickname;
                const isLikedByUser = post.likes && post.likes.includes(userNickname);
                const isFavoritedByUser = favoritedPostIds.has(post.id); // 使用Set快速查找

                postEl.innerHTML = `
                    <div class="post-header"><img src="${authorAvatar}" class="post-avatar"><div class="post-info"><span class="post-nickname">${authorNickname}</span><span class="post-timestamp">${formatPostTimestamp(post.timestamp)}</span></div>

        <!-- 【新增】动态操作按钮 -->
        <div class="post-actions-btn">…</div>
    </div>

                    <div class="post-main-content">${contentHtml}</div>
                    <div class="post-feedback-icons">
                        <span class="action-icon like ${isLikedByUser ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></span>
                        <span class="action-icon favorite ${isFavoritedByUser ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg></span>
                    </div>
                    ${likesHtml}
                    ${commentsHtml}
                    <div class="post-footer"><div class="comment-section"><img src="${commentAvatar}" class="comment-avatar"><input type="text" class="comment-input" placeholder="友善的评论是交流的起点"><div class="at-mention-popup"></div></div><button class="comment-send-btn">发送</button></div>
                `;
                
                const deleteAction = document.createElement('div');
                deleteAction.className = 'qzone-post-delete-action';
                deleteAction.innerHTML = '<span>删除</span>';
                postContainer.appendChild(postEl);
                postContainer.appendChild(deleteAction);
                const commentSection = postContainer.querySelector('.comment-section');
                if (commentSection) {
                    commentSection.addEventListener('touchstart', (e) => e.stopPropagation());
                    commentSection.addEventListener('mousedown', (e) => e.stopPropagation());
                }
                postsListEl.appendChild(postContainer);
                const commentInput = postContainer.querySelector('.comment-input');
                const popup = postContainer.querySelector('.at-mention-popup');
                commentInput.addEventListener('input', () => {
                    const value = commentInput.value;
                    const atMatch = value.match(/@([\p{L}\w]*)$/u);
                    if (atMatch) {
                        const namesToMention = new Set();
                        const authorNickname = postContainer.querySelector('.post-nickname')?.textContent;
                        if (authorNickname) namesToMention.add(authorNickname);
                        postContainer.querySelectorAll('.commenter-name').forEach(nameEl => {
                            namesToMention.add(nameEl.textContent.replace(':', ''));
                        });
                        namesToMention.delete(state.qzoneSettings.nickname);
                        popup.innerHTML = '';
                        if (namesToMention.size > 0) {
                            const searchTerm = atMatch[1];
                            namesToMention.forEach(name => {
                                if (name.toLowerCase().includes(searchTerm.toLowerCase())) {
                                    const item = document.createElement('div');
                                    item.className = 'at-mention-item';
                                    item.textContent = name;
                                    item.addEventListener('mousedown', (e) => {
                                        e.preventDefault();
                                        const newText = value.substring(0, atMatch.index) + `@${name} `;
                                        commentInput.value = newText;
                                        popup.style.display = 'none';
                                        commentInput.focus();
                                    });
                                    popup.appendChild(item);
                                }
                            });
                            popup.style.display = popup.children.length > 0 ? 'block' : 'none';
                        } else {
                            popup.style.display = 'none';
                        }
                    } else {
                        popup.style.display = 'none';
                    }
                });
                commentInput.addEventListener('blur', () => { setTimeout(() => { popup.style.display = 'none'; }, 200); });
            });
        }
             
// ▼▼▼ 请用下面这个【更新后的】函数，完整替换掉你代码中旧的 displayFilteredFavorites 函数 ▼▼▼

function displayFilteredFavorites(items) {
    const listEl = document.getElementById('favorites-list');
    listEl.innerHTML = '';

    if (items.length === 0) {
        const searchTerm = document.getElementById('favorites-search-input').value;
        const message = searchTerm ? '未找到相关收藏' : '你的收藏夹是空的，<br>快去动态或聊天中收藏喜欢的内容吧！';
        listEl.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">${message}</p>`;
        return;
    }

    for (const item of items) {
        const card = document.createElement('div');
        card.className = 'favorite-item-card';
        card.dataset.favid = item.id;

        let headerHtml = '', contentHtml = '', sourceText = '', footerHtml = '';

        if (item.type === 'qzone_post') {
            const post = item.content;
            sourceText = '来自动态';
            let authorAvatar = defaultAvatar, authorNickname = '未知用户';

            if (post.authorId === 'user') {
                authorAvatar = state.qzoneSettings.avatar;
                authorNickname = state.qzoneSettings.nickname;
            } else if (state.chats[post.authorId]) {
                authorAvatar = state.chats[post.authorId].settings.aiAvatar;
                authorNickname = state.chats[post.authorId].name;
            }

            headerHtml = `<img src="${authorAvatar}" class="avatar"><div class="info"><div class="name">${authorNickname}</div></div>`;
            
            const publicTextHtml = post.publicText ? `<div class="post-content">${post.publicText.replace(/\n/g, '<br>')}</div>` : '';
            if (post.type === 'shuoshuo') {
                contentHtml = `<div class="post-content">${post.content.replace(/\n/g, '<br>')}</div>`;
            } else if (post.type === 'image_post' && post.imageUrl) {
                contentHtml = publicTextHtml ? `${publicTextHtml}<div style="margin-top:10px;"><img src="${post.imageUrl}" class="chat-image"></div>` : `<img src="${post.imageUrl}" class="chat-image">`;
            } else if (post.type === 'text_image') {
                contentHtml = publicTextHtml ? `${publicTextHtml}<div style="margin-top:10px;"><img src="https://i.postimg.cc/KYr2qRCK/1.jpg" class="chat-image" style="cursor: pointer;" data-hidden-text="${post.hiddenContent}"></div>` : `<img src="https://i.postimg.cc/KYr2qRCK/1.jpg" class="chat-image" style="cursor: pointer;" data-hidden-text="${post.hiddenContent}">`;
            }

            // ▼▼▼ 新增/修改的代码开始 ▼▼▼
            
            // 1. 构造点赞区域的HTML
            let likesHtml = '';
            // 检查 post 对象中是否存在 likes 数组并且不为空
            if (post.likes && post.likes.length > 0) {
                // 如果存在，就创建点赞区域的 div
                likesHtml = `
                    <div class="post-likes-section">
                        <svg class="like-icon" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        <span>${post.likes.join('、')} 觉得很赞</span>
                    </div>`;
            }

            // 2. 构造评论区域的HTML
            let commentsHtml = '';
            // 检查 post 对象中是否存在 comments 数组并且不为空
            if (post.comments && post.comments.length > 0) {
                // 如果存在，就创建评论容器，并遍历每一条评论
                commentsHtml = '<div class="post-comments-container">';
                post.comments.forEach(comment => {
                    commentsHtml += `
                        <div class="comment-item">
                            <span class="commenter-name">${comment.commenterName}:</span>
                            <span class="comment-text">${comment.text}</span>
                        </div>`;
                });
                commentsHtml += '</div>';
            }

            // 3. 将点赞和评论的HTML组合到 footerHtml 中
            footerHtml = `${likesHtml}${commentsHtml}`;
            
            // ▲▲▲ 新增/修改的代码结束 ▲▲▲

        } else if (item.type === 'chat_message') {
            const msg = item.content;
            const chat = state.chats[item.chatId];
            if (!chat) continue; 

            sourceText = `来自与 ${chat.name} 的聊天`;
            const isUser = msg.role === 'user';
            let senderName, senderAvatar;

            if (isUser) {
                senderName = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
                senderAvatar = chat.settings.myAvatar || (chat.isGroup ? defaultMyGroupAvatar : defaultAvatar);
            } else {
                 if (chat.isGroup) {
                    const member = chat.members.find(m => m.name === msg.senderName);
                    senderName = msg.senderName;
                    senderAvatar = member ? member.avatar : defaultGroupMemberAvatar;
                } else {
                    senderName = chat.name;
                    senderAvatar = chat.settings.aiAvatar || defaultAvatar;
                }
            }

            headerHtml = `<img src="${senderAvatar}" class="avatar"><div class="info"><div class="name">${senderName}</div></div>`;
            
            if (typeof msg.content === 'string' && STICKER_REGEX.test(msg.content)) {
                contentHtml = `<img src="${msg.content}" class="sticker-image" style="max-width: 80px; max-height: 80px;">`;
            } else if (Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
                contentHtml = `<img src="${msg.content[0].image_url.url}" class="chat-image">`;
            } else {
                contentHtml = String(msg.content || '').replace(/\n/g, '<br>');
            }
        }
        
        // ▼▼▼ 修改最终的HTML拼接，加入 footerHtml ▼▼▼
        card.innerHTML = `
            <div class="fav-card-header">${headerHtml}<div class="source">${sourceText}</div></div>
            <div class="fav-card-content">${contentHtml}</div>
            ${footerHtml}`; // <-- 把我们新创建的 footerHtml 放在这里
            
        listEl.appendChild(card);
    }
}

// ▲▲▲ 替换区域结束 ▲▲▲

        /**
         * 【重构后的函数】: 负责准备数据并触发渲染
         */
        async function renderFavoritesScreen() {
            // 1. 从数据库获取最新数据并缓存
            allFavoriteItems = await db.favorites.orderBy('timestamp').reverse().toArray();
            
            // 2. 清空搜索框并隐藏清除按钮
            const searchInput = document.getElementById('favorites-search-input');
            const clearBtn = document.getElementById('favorites-search-clear-btn');
            searchInput.value = '';
            clearBtn.style.display = 'none';

            // 3. 显示所有收藏项
            displayFilteredFavorites(allFavoriteItems);
        }

        // ▲▲▲ 粘贴结束 ▲▲▲

        function resetCreatePostModal() {
            document.getElementById('post-public-text').value = '';
            document.getElementById('post-image-preview').src = '';
            document.getElementById('post-image-description').value = '';
            document.getElementById('post-image-preview-container').classList.remove('visible');
            document.getElementById('post-image-desc-group').style.display = 'none';
            document.getElementById('post-local-image-input').value = '';
            document.getElementById('post-hidden-text').value = '';
            document.getElementById('switch-to-image-mode').click();
        }

// ▼▼▼ 用这个【已包含 memories】的版本，完整替换旧的 exportBackup 函数 ▼▼▼
async function exportBackup() {
    try {
        const backupData = {
            version: 1, 
            timestamp: Date.now()
        };

        const [
            chats, worldBooks, userStickers, apiConfig, globalSettings,
            imageConfig, personaPresets, musicLibrary, qzoneSettings, qzonePosts,
            qzoneAlbums, qzonePhotos, favorites, qzoneGroups,
            memories // 【核心修正】新增
        ] = await Promise.all([
            db.chats.toArray(),
            db.worldBooks.toArray(),
            db.userStickers.toArray(),
            db.apiConfig.get('main'),
            db.globalSettings.get('main'),
            db.imageConfig.get('main'),
            db.personaPresets.toArray(),
            db.musicLibrary.get('main'),
            db.qzoneSettings.get('main'),
            db.qzonePosts.toArray(),
            db.qzoneAlbums.toArray(),
            db.qzonePhotos.toArray(),
            db.favorites.toArray(),
            db.qzoneGroups.toArray(),
            db.memories.toArray() // 【核心修正】新增
        ]);

        Object.assign(backupData, {
            chats, worldBooks, userStickers, apiConfig, globalSettings,
            imageConfig, personaPresets, musicLibrary, qzoneSettings, qzonePosts,
            qzoneAlbums, qzonePhotos, favorites, qzoneGroups,
            memories // 【核心修正】新增
        });
        
        const blob = new Blob(
            [JSON.stringify(backupData, null, 2)], 
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), {
            href: url,
            download: `EPhone-Full-Backup-${new Date().toISOString().split('T')[0]}.json`
        });
        link.click();
        URL.revokeObjectURL(url);
        
        await showCustomAlert('导出成功', '已成功导出所有数据！');

    } catch (error) {
        console.error("导出数据时出错:", error);
        await showCustomAlert('导出失败', `发生了一个错误: ${error.message}`);
    }
}

// ▼▼▼ 用这个【已包含 memories】的版本，完整替换旧的 importBackup 函数 ▼▼▼
async function importBackup(file) {
    if (!file) return;

    const confirmed = await showCustomConfirm(
        '严重警告！',
        '导入备份将完全覆盖您当前的所有数据，包括聊天、动态、设置等。此操作不可撤销！您确定要继续吗？',
        { confirmButtonClass: 'btn-danger' }
    );

    if (!confirmed) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        await db.transaction('rw', db.tables, async () => {
            for (const table of db.tables) {
                await table.clear();
            }

            if (Array.isArray(data.chats)) await db.chats.bulkPut(data.chats);
            if (Array.isArray(data.worldBooks)) await db.worldBooks.bulkPut(data.worldBooks);
            if (Array.isArray(data.userStickers)) await db.userStickers.bulkPut(data.userStickers);
            if (Array.isArray(data.personaPresets)) await db.personaPresets.bulkPut(data.personaPresets);
            if (Array.isArray(data.qzonePosts)) await db.qzonePosts.bulkPut(data.qzonePosts);
            if (Array.isArray(data.qzoneAlbums)) await db.qzoneAlbums.bulkPut(data.qzoneAlbums);
            if (Array.isArray(data.qzonePhotos)) await db.qzonePhotos.bulkPut(data.qzonePhotos);
            if (Array.isArray(data.favorites)) await db.favorites.bulkPut(data.favorites);
            if (Array.isArray(data.qzoneGroups)) await db.qzoneGroups.bulkPut(data.qzoneGroups);
            if (Array.isArray(data.memories)) await db.memories.bulkPut(data.memories); // 【核心修正】新增

            if (data.apiConfig) await db.apiConfig.put(data.apiConfig);
            if (data.imageConfig) await db.imageConfig.put(data.imageConfig);
            if (data.globalSettings) await db.globalSettings.put(data.globalSettings);
            if (data.musicLibrary) await db.musicLibrary.put(data.musicLibrary);
            if (data.qzoneSettings) await db.qzoneSettings.put(data.qzoneSettings);
        });

        await showCustomAlert('导入成功', '所有数据已成功恢复！应用即将刷新以应用所有更改。');
        
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error("导入数据时出错:", error);
        await showCustomAlert('导入失败', `文件格式不正确或数据已损坏: ${error.message}`);
    }
}

        function applyCustomFont(fontUrl, isPreviewOnly = false) {
            if (!fontUrl) {
                dynamicFontStyle.innerHTML = '';
                document.getElementById('font-preview').style.fontFamily = '';
                return;
            }
            const fontName = 'custom-user-font';
            const newStyle = `
                @font-face {
                  font-family: '${fontName}';
                  src: url('${fontUrl}');
                  font-display: swap;
                }`;
            if (isPreviewOnly) {
                const previewStyle = document.getElementById('preview-font-style') || document.createElement('style');
                previewStyle.id = 'preview-font-style';
                previewStyle.innerHTML = newStyle;
                if (!document.getElementById('preview-font-style')) document.head.appendChild(previewStyle);
                document.getElementById('font-preview').style.fontFamily = `'${fontName}', 'bulangni', sans-serif`;
            } else {
                dynamicFontStyle.innerHTML = `
                    ${newStyle}
                    body {
                      font-family: '${fontName}', 'bulangni', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    }`;
            }
        }

        async function resetToDefaultFont() {
            dynamicFontStyle.innerHTML = ''; 
            state.globalSettings.fontUrl = '';
            await db.globalSettings.put(state.globalSettings);
            document.getElementById('font-url-input').value = '';
            document.getElementById('font-preview').style.fontFamily = '';
            alert('已恢复默认字体。');
        }

async function loadAllDataFromDB() {
    // ▼▼▼ 【核心修改在这里】 ▼▼▼
    const [
        chatsArr,
        apiConfig,
        globalSettings,
        imageConfig,
        userStickers,
        worldBooks,
        musicLib,
        personaPresets,
        qzoneSettings,
        initialFavorites, // 将 initialFavorites 加入到解构赋值中
        charactersArr // 新增：載入角色數據
    ] = await Promise.all([
        db.chats.toArray(),
        db.apiConfig.get('main'),
        db.globalSettings.get('main'),
        db.imageConfig.get('main'),
        db.userStickers.toArray(),
        db.worldBooks.toArray(),
        db.musicLibrary.get('main'),
        db.personaPresets.toArray(),
        db.qzoneSettings.get('main'),
        db.favorites.orderBy('timestamp').reverse().toArray(), // 确保这一行在 Promise.all 的数组参数内
        db.characters.toArray() // 新增：載入角色數據
    ]);
    // ▲▲▲ 【修改结束】 ▲▲▲

    state.chats = chatsArr.reduce((acc, chat) => {

        // --- ▼▼▼ 核心修复就在这里 ▼▼▼ ---
        // 检查1：如果是一个单聊，并且没有 status 属性
        if (!chat.isGroup && !chat.status) {
            // 就为它补上一个默认的 status 对象
            chat.status = {
                text: '在线',
                lastUpdate: Date.now(),
                isBusy: false
            };
            console.log(`为旧角色 "${chat.name}" 补全了status属性。`);
        }
        // --- ▲▲▲ 修复结束 ▲▲▲

        // --- ▼▼▼ 核心修复就在这里 ▼▼▼ ---
        // 检查2：兼容最新的“关系”功能
        if (!chat.isGroup && !chat.relationship) {
            // 如果是单聊，且没有 relationship 对象，就补上一个默认的
            chat.relationship = {
                status: 'friend',
                blockedTimestamp: null,
                applicationReason: ''
            };
            console.log(`为旧角色 "${chat.name}" 补全了 relationship 属性。`);
        }
        // --- ▲▲▲ 修复结束 ▲▲▲

    // ▼▼▼ 在这里添加 ▼▼▼
    if (!chat.isGroup && (!chat.settings || !chat.settings.aiAvatarLibrary)) {
        if (!chat.settings) chat.settings = {}; // 以防万一连settings都没有
        chat.settings.aiAvatarLibrary = [];
        console.log(`为旧角色 "${chat.name}" 补全了aiAvatarLibrary属性。`);
    }
    // ▲▲▲ 添加结束 ▲▲▲

        if (!chat.musicData) chat.musicData = { totalTime: 0 };
        if (chat.settings && chat.settings.linkedWorldBookId && !chat.settings.linkedWorldBookIds) {
            chat.settings.linkedWorldBookIds = [chat.settings.linkedWorldBookId];
            delete chat.settings.linkedWorldBookId;
        }
        acc[chat.id] = chat;
        return acc;
    }, {});
    state.apiConfig = apiConfig || { id: 'main', proxyUrl: '', apiKey: '', model: '' };
    state.imageConfig = imageConfig || { 
        id: 'main', 
        model: '', 
        apiUrl: '', 
        apiKey: '', 
        autoGenerate: false, 
        aiImageGeneration: false,
        imageGenerationFrequency: 'medium',
        quality: 'standard', 
        size: '1024x1024' 
    };
state.globalSettings = globalSettings || { id: 'main', wallpaper: 'linear-gradient(135deg, #89f7fe, #66a6ff)', fontUrl: '', enableBackgroundActivity: false, backgroundActivityInterval: 60,
    blockCooldownHours: 1 // <-- 【新增】默认冷静期为1小时
};
    state.userStickers = userStickers || [];
    state.worldBooks = worldBooks || [];
    musicState.playlist = musicLib?.playlist || [];
    state.personaPresets = personaPresets || [];
    state.qzoneSettings = qzoneSettings || { id: 'main', nickname: '{{user}}', avatar: 'https://files.catbox.moe/q6z5fc.jpeg', banner: 'https://files.catbox.moe/r5heyt.gif' };

    // ▼▼▼ 【确保这一行在 Promise.all 之后，并使用解构赋值得到的 initialFavorites】 ▼▼▼
    allFavoriteItems = initialFavorites || [];
    // ▲▲▲ 【修改结束】 ▲▲▲
    
    // 新增：處理角色數據
    console.log('[JCY] 載入角色數據:', charactersArr?.length || 0, '個角色');
    if (charactersArr && charactersArr.length > 0) {
        // 將角色數據存儲到全局變量中，供人設庫使用
        window.charactersData = charactersArr;
        console.log('[JCY] 角色數據已載入到全局變量');
    }
}

        async function saveGlobalPlaylist() { await db.musicLibrary.put({ id: 'main', playlist: musicState.playlist }); }

        function formatTimestamp(timestamp) { if (!timestamp) return ''; const date = new Date(timestamp); const hours = String(date.getHours()).padStart(2, '0'); const minutes = String(date.getMinutes()).padStart(2, '0'); return `${hours}:${minutes}`; }

        function showNotification(chatId, messageContent) { clearTimeout(notificationTimeout); const chat = state.chats[chatId]; if (!chat) return; const bar = document.getElementById('notification-bar'); document.getElementById('notification-avatar').src = chat.settings.aiAvatar || chat.settings.groupAvatar || defaultAvatar; document.getElementById('notification-content').querySelector('.name').textContent = chat.name; document.getElementById('notification-content').querySelector('.message').textContent = messageContent; const newBar = bar.cloneNode(true); bar.parentNode.replaceChild(newBar, bar); newBar.addEventListener('click', () => { openChat(chatId); newBar.classList.remove('visible'); }); newBar.classList.add('visible'); notificationTimeout = setTimeout(() => { newBar.classList.remove('visible'); }, 4000); }

        function updateClock() { const now = new Date(); const timeString = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); const dateString = now.toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }); document.getElementById('main-time').textContent = timeString; document.getElementById('status-bar-time').textContent = timeString; document.getElementById('main-date').textContent = dateString; }

// ▼▼▼ 请用这个【终极加强版】的函数，完整替换掉你代码中旧的 parseAiResponse 函数 ▼▼▼
function parseAiResponse(content) {
    const trimmedContent = content.trim();

    // 0. 【新增】优先检测VN_TYPE格式
    if (trimmedContent.includes('<dialogues>') || 
        trimmedContent.includes('<choices>') || 
        trimmedContent.includes('<info>') || 
        trimmedContent.includes('<charadata>') ||
        trimmedContent.includes('[Scene|') ||
        trimmedContent.includes('[Item|') ||
        trimmedContent.includes('[Call|') ||
        trimmedContent.includes('[Chat|')) {
        
        console.log('[JCY-AI解析器] 检测到VN_TYPE格式，使用VN解析器处理');
        try {
            const vnData = parseVNOutput(content);
            // 将VN数据转换为标准消息格式
            const messages = [];
            
            // 添加场景信息
            if (vnData.sceneInfo && Object.keys(vnData.sceneInfo).length > 0) {
                messages.push({
                    type: 'vn_scene_info',
                    content: vnData.sceneInfo,
                    timestamp: Date.now()
                });
            }
            
            // 添加对话内容
            if (vnData.dialogues && vnData.dialogues.length > 0) {
                messages.push({
                    type: 'vn_dialogues',
                    content: vnData.dialogues,
                    timestamp: Date.now()
                });
            }
            
            // 添加选项内容
            if (vnData.choices && vnData.choices.length > 0) {
                messages.push({
                    type: 'vn_choices',
                    content: vnData.choices,
                    timestamp: Date.now()
                });
            }
            
            // 添加角色信息
            if (vnData.narrator && Object.keys(vnData.narrator).length > 0) {
                messages.push({
                    type: 'vn_narrator',
                    content: vnData.narrator,
                    timestamp: Date.now()
                });
            }
            
            // 添加角色关系数据
            if (vnData.charData && Object.keys(vnData.charData).length > 0) {
                messages.push({
                    type: 'vn_char_data',
                    content: vnData.charData,
                    timestamp: Date.now()
                });
            }
            
            console.log('[JCY-AI解析器] VN_TYPE解析完成，生成消息数量:', messages.length);
            return messages;
            
        } catch (error) {
            console.error('[JCY-AI解析器] VN_TYPE解析失败，回退到标准解析:', error);
        }
    }

    // 1. 【全新】优先处理 "[...][...]" 这种粘连的JSON数组格式
    if (trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) {
        // 使用正则表达式匹配所有独立的 "[...]" 块
        const matches = trimmedContent.match(/\[(.*?)\]/g);
        
        // 如果匹配到多个块，说明是粘连格式
        if (matches && matches.length > 1) {
            try {
                let combinedResults = [];
                for (const match of matches) {
                    // 逐个解析每个 " [...] " 字符串块
                    const parsedArray = JSON.parse(match);
                    if (Array.isArray(parsedArray)) {
                        // 将解析出的数组内容合并到总结果中
                        combinedResults = combinedResults.concat(parsedArray);
                    }
                }
                // 如果成功合并了内容，就返回最终结果
                if (combinedResults.length > 0) {
                    console.log("成功解析粘连格式的JSON:", combinedResults);
                    return combinedResults;
                }
            } catch (e) {
                // 如果解析过程中出错，就放弃这种方法，让代码继续尝试下面的旧方法
                console.warn("尝试解析粘连JSON失败，回退到标准解析流程。", e);
            }
        }
    }

    // 2. 尝试作为标准的、单一的JSON数组解析
    if (trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmedContent);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (e) {
            // 解析失败，继续尝试其他方法
        }
    }

    // 3. 尝试作为单个JSON对象解析 (处理AI只返回一个对象的情况)
    if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmedContent);
            // 成功解析为对象后，将其放入数组中，统一格式
            return [parsed]; 
        } catch (e) {
            // 解析失败，继续
        }
    }
    
    // 4. 作为最后的备用方案，尝试从文本中提取JSON数组
    try {
        const match = content.match(/\[(.*?)\]/s);
        if (match && match[0]) {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        // 提取失败
    }

    // 5. 如果以上全部失败，则视为纯文本处理
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('```'));
    if (lines.length > 0) {
         // 将纯文本包装成标准消息对象
        return lines.map(line => ({ type: 'text', content: line }));
    }
    
    // 6. 最终的最终，返回包含原始文本的单个消息对象
    return [{ type: 'text', content: content }];
}
// ▲▲▲ 替换结束 ▲▲▲

        // API相關功能已移至 JCY_API_module.js
        // 使用API模塊中的函數
        const renderApiSettings = () => window.JCYAPIModule?.renderApiSettings?.() || console.warn('API模塊未加載');
        const updateApiProviderUI = () => window.JCYAPIModule?.updateApiProviderUI?.() || console.warn('API模塊未加載');
        const updateImageModelUI = () => window.JCYAPIModule?.updateImageModelUI?.() || console.warn('API模塊未加載');
        const callApiUnified = window.JCYAPIModule?.callApiUnified || (() => { throw new Error('API模塊未加載'); });
        
        window.renderApiSettingsProxy = renderApiSettings;

        // ▼▼▼ VN系統相關功能 ▼▼▼

        // 打開人設庫
        function openCharacterLibrary() {
            console.log('[JCY-CharLib] 正在打開人設庫...');
            
            // 重置準備狀態
            window.characterLibraryReady = false;
            
            // 檢查是否已存在模態窗口
            let modal = document.getElementById('character-library-modal');
            
            if (!modal) {
                // 動態創建人設庫模態窗口
                modal = document.createElement('div');
                modal.id = 'character-library-modal';
                modal.innerHTML = `
                    <div class="character-library-modal-overlay">
                        <div class="character-library-modal-container">
                            <iframe id="character-library-iframe" src="character_library/character_library.html" frameborder="0"></iframe>
                        </div>
                    </div>
                `;
                
                // 添加人設庫模態窗口樣式
                if (!document.getElementById('character-library-modal-styles')) {
                    const charLibStyles = document.createElement('style');
                    charLibStyles.id = 'character-library-modal-styles';
                    charLibStyles.textContent = `
                        /* 人設庫模態窗口樣式 */
                        #character-library-modal {
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: rgba(0, 0, 0, 0.8);
                            z-index: 1000;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            backdrop-filter: blur(5px);
                        }
                        
                        .character-library-modal-overlay {
                            width: 100%;
                            height: 100%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        
                        .character-library-modal-container {
                            position: relative;
                            width: 95vw;
                            height: 95vh;
                            max-width: 1000px;
                            max-height: 700px;
                            background: #1a1a2e;
                            border-radius: 15px;
                            overflow: hidden;
                            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                        }
                        
                        #character-library-iframe {
                            width: 100%;
                            height: 100%;
                            border: none;
                            border-radius: 15px;
                        }
                        
                        @media (max-width: 768px) {
                            .character-library-modal-container {
                                width: 100vw;
                                height: 100vh;
                                border-radius: 0;
                            }
                            
                            #character-library-iframe {
                                border-radius: 0;
                            }
                        }
                    `;
                    document.head.appendChild(charLibStyles);
                }
                
                // 添加到body
                document.body.appendChild(modal);
                
                console.log('[JCY-CharLib] 人設庫模態窗口已創建');
                
                // 等待iframe加載完成
                const iframe = document.getElementById('character-library-iframe');
                iframe.onload = function() {
                    console.log('[JCY-CharLib] iframe已加載完成，設置通信');
                    setupCharacterLibraryCommunication();
                };
            } else {
                // 如果模態窗口已存在，直接設置通信
                setupCharacterLibraryCommunication();
            }
            
            // 顯示模態窗口
            modal.style.display = 'flex';
            
            console.log('[JCY-CharLib] 人設庫已打開');
        }

        // 關閉人設庫
        function closeCharacterLibrary() {
            const modal = document.getElementById('character-library-modal');
            if (modal) {
                modal.style.display = 'none';
                // 重置準備狀態
                window.characterLibraryReady = false;
                console.log('[JCY-CharLib] 人設庫已關閉');
            }
        }

        // 打開VN面板
        function openVNPanel() {
            console.log('[JCY] 打開VN面板');
            showScreen('vn-panel-screen');
        
        // 觸發COT處理器事件
        if (window.JCYCOTProcessor) {
            document.dispatchEvent(new CustomEvent('VNPanelOpened'));
        }
            
            // 設置VN面板iframe的通信
            const vnIframe = document.getElementById('vn-iframe');
            if (vnIframe) {
                // 等待iframe加載完成後發送初始化消息
                vnIframe.onload = function() {
                    console.log('[JCY] VN面板已加載');
                    // 發送當前聊天狀態到VN面板
                    if (state.activeChatId && state.chats[state.activeChatId]) {
                        const chat = state.chats[state.activeChatId];
                        vnIframe.contentWindow.postMessage({
                            type: 'VN_INIT',
                            data: {
                                chatId: state.activeChatId,
                                chatName: chat.name,
                                aiPersona: chat.settings.aiPersona,
                                myPersona: chat.settings.myPersona,
                                aiAvatar: chat.settings.aiAvatar,
                                myAvatar: chat.settings.myAvatar
                            }
                        }, '*');
                    }
                };
            }
        }
        
        // 將openVNPanel函數暴露到全局作用域
        window.openVNPanel = openVNPanel;

        // 設置VN面板通信
        function setupVNCommunication() {
            window.addEventListener('message', function(event) {
                // 處理來自VN面板的消息
                const { type, messageId, data, source } = event.data || {};
                
                // 檢查消息來源：VN面板iframe或VN劇情設置
                const vnIframe = document.getElementById('vn-iframe');
                const isFromVNPanel = vnIframe && event.source === vnIframe.contentWindow;
                const isFromVNStorySettings = source === 'VN_STORY_SETTINGS';
                
                if (!isFromVNPanel && !isFromVNStorySettings) {
                    return;
                }
                
                console.log('[JCY-VN通信] 收到VN相關消息:', type, '來源:', isFromVNPanel ? 'VN面板' : 'VN劇情設置');
                
                if (!type || !type.startsWith('VN_')) {
                    return;
                }
                    
                // 處理VN_STORY_START消息
                if (type === 'VN_STORY_START') {
                    console.log('[JCY-VN通信] 收到VN_STORY_START消息，數據結構:', {
                        type: type,
                        data: data,
                        worldBooks: data?.worldBooks,
                        worldBooksCount: data?.worldBooks?.length || 0
                    });
                    handleVNStoryStart(data);
                }
                // 處理VN_AI_REQUEST消息
                else if (type === 'VN_AI_REQUEST') {
                    handleVNAIRequest(data);
                }
                // 處理VN_CHOICE消息（選擇按鈕）
                else if (type === 'VN_CHOICE') {
                    handleVNChoice(data);
                }
                // 處理VN_REQUEST_CHARACTERS消息
                else if (type === 'VN_REQUEST_CHARACTERS') {
                    handleVNCharactersRequest();
                }
                // 處理VN_REQUEST_WORLDBOOKS消息
                else if (type === 'VN_REQUEST_WORLDBOOKS') {
                    handleVNWorldBooksRequest();
                }
                // 處理VN_PANEL_READY消息
                else if (type === 'VN_PANEL_READY') {
                    console.log('[JCY-VN通信] VN面板已準備就緒');
                    // 發送初始化數據到VN面板
                    if (vnIframe && vnIframe.contentWindow && state.activeChatId && state.chats[state.activeChatId]) {
                        const chat = state.chats[state.activeChatId];
                        vnIframe.contentWindow.postMessage({
                            type: 'VN_INIT',
                            data: {
                                chatId: state.activeChatId,
                                chatName: chat.name,
                                aiPersona: chat.settings.aiPersona,
                                myPersona: chat.settings.myPersona,
                                aiAvatar: chat.settings.aiAvatar,
                                myAvatar: chat.settings.myAvatar
                            }
                        }, '*');
                    }
                }
                // 處理VN_SHOW_HISTORY_VIEWER消息
                else if (type === 'VN_SHOW_HISTORY_VIEWER') {
                    console.log('[JCY-VN通信] 收到顯示歷史劇情查看器請求');
                    showVNHistoryViewer();
                }
            });
        }

        // 初始化VN通信
        setupVNCommunication();

        // 設置人設庫通信
        function setupCharacterLibraryCommunication() {
            window.addEventListener('message', handleCharacterLibraryMessage);
        }

        // 處理來自人設庫的消息
        function handleCharacterLibraryMessage(event) {
            const { type, data } = event.data || {};
            
            console.log('[JCY-CharLib通信] 收到消息:', event.data);
            
            // 移除來源檢查，處理所有CHAR_LIB_開頭的消息
            if (!type || !type.startsWith('CHAR_LIB_')) {
                console.log('[JCY-CharLib通信] 消息類型不符合要求，跳過處理');
                return;
            }
            
            console.log('[JCY-CharLib通信] 收到人設庫消息:', type);
            
            switch (type) {
                case 'CHAR_LIB_CLOSE':
                    closeCharacterLibrary();
                    break;
                    
                case 'CHAR_LIB_SAVE_CHARACTER':
                    handleCharacterSave(data);
                    break;
                    
                case 'CHAR_LIB_DELETE_CHARACTER':
                    handleCharacterDelete(data);
                    break;
                    
                case 'CHAR_LIB_READY':
                    console.log('[JCY-CharLib通信] 人設庫已準備就緒');
                    // 標記人設庫已準備好
                    window.characterLibraryReady = true;
                    break;
                    
                case 'CHAR_LIB_DATA_UPDATED':
                    console.log('[JCY-CharLib通信] 人設庫數據已更新，角色數量:', data.count);
                    // 更新localStorage中的人设库数据
                    updateCharacterLibraryInLocalStorage();
                    // 如果聊天設置窗口是打開的，自動刷新人設列表
                    const chatSettingsModal = document.getElementById('chat-settings-modal');
                    if (chatSettingsModal && chatSettingsModal.classList.contains('visible')) {
                        console.log('[JCY-CharLib通信] 聊天設置正在打開，自動刷新人設列表');
                        loadCharacterLibraryToSelect().catch(error => {
                            console.error('[JCY-CharLib通信] 自動刷新人設列表失敗:', error);
                        });
                    }
                    break;
                    
                case 'CHAR_LIB_REQUEST_CHARACTERS':
                    // 處理人設庫的角色數據請求
                    handleCharLibCharactersRequest();
                    break;
            }
        }

        // 發送消息到人設庫
        function sendToCharacterLibrary(message) {
            const iframe = document.getElementById('character-library-iframe');
            if (iframe && iframe.contentWindow) {
                // 檢查人設庫是否已準備好
                if (window.characterLibraryReady) {
                    try {
                        iframe.contentWindow.postMessage(message, '*');
                        console.log('[JCY-CharLib] 已發送消息到人設庫:', message.type);
                    } catch (error) {
                        console.error('[JCY-CharLib] 發送消息到人設庫失敗:', error);
                    }
                } else {
                    // 如果人設庫還沒準備好，等待一段時間後重試
                    console.log('[JCY-CharLib] 人設庫尚未準備好，等待中...');
                    let attempts = 0;
                    const maxAttempts = 50; // 最多等待5秒
                    
                    const checkReady = () => {
                        attempts++;
                        if (window.characterLibraryReady) {
                            try {
                                iframe.contentWindow.postMessage(message, '*');
                                console.log('[JCY-CharLib] 延遲發送消息成功:', message.type);
                            } catch (error) {
                                console.error('[JCY-CharLib] 延遲發送消息失敗:', error);
                            }
                        } else if (attempts < maxAttempts) {
                            setTimeout(checkReady, 100);
                        } else {
                            console.error('[JCY-CharLib] 等待人設庫準備超時');
                        }
                    };
                    
                    setTimeout(checkReady, 100);
                }
            } else {
                console.warn('[JCY-CharLib] 人設庫iframe未準備好');
            }
        }

        // 處理角色保存
        async function handleCharacterSave(characterData) {
            try {
                console.log('[JCY-CharLib] 開始保存角色數據:', characterData);
                
                // 使用IndexedDB保存角色
                await db.characters.put(characterData);
                
                console.log('[JCY-CharLib] ✅ 角色保存成功 -', characterData.name);
                
                sendToCharacterLibrary({
                    type: 'CHAR_SAVE_SUCCESS',
                    data: characterData
                });
                
            } catch (error) {
                console.error('[JCY-CharLib] ❌ 保存角色失敗:', error);
                sendToCharacterLibrary({
                    type: 'CHAR_SAVE_ERROR',
                    error: error.message
                });
            }
        }

        // 處理角色刪除
        async function handleCharacterDelete(characterId) {
            try {
                console.log('[JCY-CharLib] 刪除角色:', characterId);
                
                // 使用IndexedDB刪除角色
                await db.characters.delete(characterId);
                
                sendToCharacterLibrary({
                    type: 'CHAR_DELETE_SUCCESS',
                    data: { id: characterId }
                });
                
                console.log('[JCY-CharLib] 角色刪除成功');
                
            } catch (error) {
                console.error('[JCY-CharLib] 刪除角色失敗:', error);
                sendToCharacterLibrary({
                    type: 'CHAR_DELETE_ERROR',
                    error: error.message
                });
            }
        }
        
        // 處理人設庫的角色數據請求
        async function handleCharLibCharactersRequest() {
            try {
                console.log('[JCY-CharLib] 處理人設庫角色數據請求');
                
                // 從IndexedDB獲取角色數據
                const characters = await db.characters.toArray();
                
                // 發送角色數據到人設庫
                sendToCharacterLibrary({
                    type: 'JCY_RESPONSE_CHAR_LIB_CHARACTERS',
                    characters: characters,
                    timestamp: Date.now()
                });
                
                console.log('[JCY-CharLib] 已發送角色數據到人設庫:', characters.length, '個角色');
                
            } catch (error) {
                console.error('[JCY-CharLib] 處理人設庫角色數據請求失敗:', error);
                
                // 發送錯誤回應
                sendToCharacterLibrary({
                    type: 'JCY_RESPONSE_CHAR_LIB_CHARACTERS',
                    characters: [],
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        // 處理VN面板的角色數據請求
        async function handleVNCharactersRequest() {
            try {
                console.log('[JCY-VN] 處理VN面板角色數據請求');
                
                // 從IndexedDB獲取角色數據
                const characters = await db.characters.toArray();
                
                // 嘗試多個可能的VN面板iframe ID
                const possibleIframeIds = ['vn-iframe', 'vn-system-iframe', 'vn-panel-iframe', 'vn-mobile-iframe'];
                let vnIframe = null;
                
                for (const iframeId of possibleIframeIds) {
                    vnIframe = document.getElementById(iframeId);
                    if (vnIframe && vnIframe.contentWindow) {
                        console.log('[JCY-VN] 找到VN面板iframe:', iframeId);
                        break;
                    }
                }
                
                if (vnIframe && vnIframe.contentWindow) {
                    vnIframe.contentWindow.postMessage({
                        type: 'JCY_RESPONSE_CHARACTERS',
                        characters: characters,
                        timestamp: Date.now()
                    }, '*');
                    
                    console.log('[JCY-VN] 已發送角色數據到VN面板:', characters.length, '個角色');
                } else {
                    console.warn('[JCY-VN] VN面板iframe未準備好，嘗試廣播消息');
                    
                    // 如果找不到特定的iframe，嘗試廣播到所有iframe
                    const allIframes = document.querySelectorAll('iframe');
                    let messageSent = false;
                    
                    allIframes.forEach(iframe => {
                        if (iframe.contentWindow) {
                            try {
                                iframe.contentWindow.postMessage({
                                    type: 'JCY_RESPONSE_CHARACTERS',
                                    characters: characters,
                                    timestamp: Date.now()
                                }, '*');
                                messageSent = true;
                                console.log('[JCY-VN] 已廣播角色數據到iframe:', iframe.src);
                            } catch (error) {
                                console.warn('[JCY-VN] 廣播到iframe失敗:', iframe.src, error);
                            }
                        }
                    });
                    
                    if (!messageSent) {
                        console.error('[JCY-VN] 無法找到任何可用的iframe來發送角色數據');
                    }
                }
                
            } catch (error) {
                console.error('[JCY-VN] 處理VN面板角色數據請求失敗:', error);
                
                // 嘗試發送錯誤回應
                const allIframes = document.querySelectorAll('iframe');
                allIframes.forEach(iframe => {
                    if (iframe.contentWindow) {
                        try {
                            iframe.contentWindow.postMessage({
                                type: 'JCY_RESPONSE_CHARACTERS',
                                characters: [],
                                error: error.message,
                                timestamp: Date.now()
                            }, '*');
                        } catch (broadcastError) {
                            console.warn('[JCY-VN] 廣播錯誤消息失敗:', iframe.src, broadcastError);
                        }
                    }
                });
            }
        }
        
        // 處理VN面板的世界書數據請求
        async function handleVNWorldBooksRequest() {
            try {
                console.log('[JCY-VN] 處理VN面板世界書數據請求');
                
                // 從state獲取世界書數據
                const worldBooks = state.worldBooks || [];
                
                // 嘗試多個可能的VN面板iframe ID
                const possibleIframeIds = ['vn-iframe', 'vn-system-iframe', 'vn-panel-iframe', 'vn-mobile-iframe'];
                let vnIframe = null;
                
                for (const iframeId of possibleIframeIds) {
                    vnIframe = document.getElementById(iframeId);
                    if (vnIframe && vnIframe.contentWindow) {
                        console.log('[JCY-VN] 找到VN面板iframe:', iframeId);
                        break;
                    }
                }
                
                if (vnIframe && vnIframe.contentWindow) {
                    vnIframe.contentWindow.postMessage({
                        type: 'JCY_RESPONSE_WORLDBOOKS',
                        worldBooks: worldBooks,
                        timestamp: Date.now()
                    }, '*');
                    
                    console.log('[JCY-VN] 已發送世界書數據到VN面板:', worldBooks.length, '個世界書');
                } else {
                    console.warn('[JCY-VN] VN面板iframe未準備好，嘗試廣播消息');
                    
                    // 如果找不到特定的iframe，嘗試廣播到所有iframe
                    const allIframes = document.querySelectorAll('iframe');
                    let messageSent = false;
                    
                    allIframes.forEach(iframe => {
                        if (iframe.contentWindow) {
                            try {
                                iframe.contentWindow.postMessage({
                                    type: 'JCY_RESPONSE_WORLDBOOKS',
                                    worldBooks: worldBooks,
                                    timestamp: Date.now()
                                }, '*');
                                messageSent = true;
                                console.log('[JCY-VN] 已廣播世界書數據到iframe:', iframe.src);
                            } catch (error) {
                                console.warn('[JCY-VN] 廣播到iframe失敗:', iframe.src, error);
                            }
                        }
                    });
                    
                    if (!messageSent) {
                        console.error('[JCY-VN] 無法找到任何可用的iframe來發送世界書數據');
                    }
                }
                
            } catch (error) {
                console.error('[JCY-VN] 處理VN面板世界書數據請求失敗:', error);
                
                // 嘗試發送錯誤回應
                const allIframes = document.querySelectorAll('iframe');
                allIframes.forEach(iframe => {
                    if (iframe.contentWindow) {
                        try {
                            iframe.contentWindow.postMessage({
                                type: 'JCY_RESPONSE_WORLDBOOKS',
                                worldBooks: [],
                                error: error.message,
                                timestamp: Date.now()
                            }, '*');
                        } catch (broadcastError) {
                            console.warn('[JCY-VN] 廣播錯誤消息失敗:', iframe.src, broadcastError);
                        }
                    }
                });
            }
        }
             
        // 通知VN面板世界書數據已更新
        function notifyVNPanelWorldBooksUpdated() {
            try {
                console.log('[JCY-VN] 通知VN面板世界書數據已更新');
                
                // 嘗試多個可能的VN面板iframe ID
                const possibleIframeIds = ['vn-iframe', 'vn-system-iframe', 'vn-panel-iframe', 'vn-mobile-iframe'];
                let vnIframe = null;
                
                for (const iframeId of possibleIframeIds) {
                    vnIframe = document.getElementById(iframeId);
                    if (vnIframe && vnIframe.contentWindow) {
                        console.log('[JCY-VN] 找到VN面板iframe:', iframeId);
                        break;
                    }
                }
                
                if (vnIframe && vnIframe.contentWindow) {
                    // 立即發送一次通知
                    vnIframe.contentWindow.postMessage({
                        type: 'JCY_WORLDBOOKS_UPDATED',
                        worldBooks: state.worldBooks || [],
                        timestamp: Date.now()
                    }, '*');
                    
                    console.log('[JCY-VN] 已通知VN面板世界書數據更新:', state.worldBooks.length, '個世界書');
                    
                    // 延遲發送第二次通知，確保VN面板有足夠時間處理
                    setTimeout(() => {
                        try {
                            if (vnIframe && vnIframe.contentWindow) {
                                vnIframe.contentWindow.postMessage({
                                    type: 'JCY_WORLDBOOKS_UPDATED',
                                    worldBooks: state.worldBooks || [],
                                    timestamp: Date.now()
                                }, '*');
                                console.log('[JCY-VN] 延遲通知VN面板世界書數據更新完成');
                            }
                        } catch (error) {
                            console.warn('[JCY-VN] 延遲通知失敗:', error);
                        }
                    }, 500);
                    
                    // 再延遲發送第三次通知，確保VN面板完全準備好
                    setTimeout(() => {
                        try {
                            if (vnIframe && vnIframe.contentWindow) {
                                vnIframe.contentWindow.postMessage({
                                    type: 'JCY_WORLDBOOKS_UPDATED',
                                    worldBooks: state.worldBooks || [],
                                    timestamp: Date.now()
                                }, '*');
                                console.log('[JCY-VN] 最終通知VN面板世界書數據更新完成');
                            }
                        } catch (error) {
                            console.warn('[JCY-VN] 最終通知失敗:', error);
                        }
                    }, 1500);
                    
                } else {
                    console.warn('[JCY-VN] VN面板iframe未準備好，無法通知世界書更新');
                    
                    // 如果iframe還沒準備好，延遲重試
                    setTimeout(() => {
                        console.log('[JCY-VN] 重試通知VN面板世界書更新...');
                        notifyVNPanelWorldBooksUpdated();
                    }, 1000);
                }
            } catch (error) {
                console.error('[JCY-VN] 通知VN面板世界書更新失敗:', error);
            }
        }
        
        // 發送消息到VN系統
        function sendToVNSystem(message) {
            // 嘗試多個可能的VN面板iframe ID
            const possibleIframeIds = ['vn-iframe', 'vn-system-iframe', 'vn-panel-iframe', 'vn-mobile-iframe'];
            let iframe = null;
            
            for (const iframeId of possibleIframeIds) {
                iframe = document.getElementById(iframeId);
                if (iframe && iframe.contentWindow) {
                    console.log('[JCY-VN] 找到VN面板iframe:', iframeId);
                    break;
                }
            }
            
            if (iframe && iframe.contentWindow) {
                // 等待iframe完全初始化後再發送消息
                setTimeout(() => {
                    try {
                        iframe.contentWindow.postMessage(message, '*');
                        console.log('[JCY-VN] 已發送消息到VN系統:', message.type);
                    } catch (error) {
                        console.error('[JCY-VN] 發送消息到VN系統失敗:', error);
                    }
                }, 100);
            } else {
                console.warn('[JCY-VN] VN系統iframe未準備好，嘗試廣播消息');
                
                // 如果找不到特定的iframe，嘗試廣播到所有iframe
                const allIframes = document.querySelectorAll('iframe');
                let messageSent = false;
                
                allIframes.forEach(iframe => {
                    if (iframe.contentWindow) {
                        try {
                            iframe.contentWindow.postMessage(message, '*');
                            messageSent = true;
                            console.log('[JCY-VN] 已廣播消息到iframe:', iframe.src);
                        } catch (error) {
                            console.warn('[JCY-VN] 廣播到iframe失敗:', iframe.src, error);
                        }
                    }
                });
                
                if (!messageSent) {
                    console.error('[JCY-VN] 無法找到任何可用的iframe來發送消息');
                }
            }
        }
        
        // 處理VN系統的選擇請求
        async function handleVNChoiceRequest(choice) {
            try {
                console.log('[JCY-VN通信] 處理VN選擇:', choice);
                
                // 構建選擇消息
                const choiceMessage = choice.userInput ? 
                    `【選擇】${choice.text}: ${choice.userInput}` : 
                    `【選擇】${choice.text}`;
                
                // 調用AI處理選擇
                await triggerAiResponse(choiceMessage);
                
            } catch (error) {
                console.error('[JCY-VN通信] 處理VN選擇失敗:', error);
            }
        }
        
        // 處理VN數據請求
        async function handleVNDataRequest(data) {
            try {
                console.log('[JCY-VN通信] 處理VN數據請求:', data);
                
                // 構建AI請求
                const characters = data.characters || {};
                const mainCharacter = characters.main?.name || '主角';
                const supportingCharacters = characters.supporting?.map(c => c.name).join('、') || '配角';
                
                // 構建劇情生成提示詞
                const prompt = `# VN劇情生成

## 角色設定
- 主角: ${mainCharacter}
- 配角: ${supportingCharacters}

## 劇情背景
- 背景: ${background}

## 要求
請使用VN格式輸出劇情內容，包含對話、場景描述和選擇項。劇情要生動有趣，符合角色設定。

請直接輸出VN格式的劇情內容，不要包含任何解釋。`;
                
                console.log('[JCY-VN通信] 構建的提示詞:', prompt);
                console.log('[JCY-VN通信] 發送AI請求生成劇情');
                
                // 直接调用API生成剧情，不通过triggerAiResponse
                const { proxyUrl, apiKey, model } = state.apiConfig;
                console.log('[JCY-VN通信] API配置:', { proxyUrl: !!proxyUrl, apiKey: !!apiKey, model });
                
                if (!proxyUrl || !apiKey || !model) {
                    throw new Error('请先在API设置中配置反代地址、密钥并选择模型。');
                }
                
                console.log('[JCY-VN通信] 開始調用AI API...');
                const aiResponse = await callApiUnified([{ role: 'user', content: prompt }], 0.8);
                console.log('[JCY-VN通信] AI響應:', aiResponse);
                
                // 解析AI回應並發送到VN系統
                const vnData = parseVNResponse(aiResponse);
                console.log('[JCY-VN通信] 解析後的VN數據:', vnData);
                
                sendToVNSystem({
                    type: 'VN_DATA',
                    data: vnData
                });
                
                console.log('[JCY-VN通信] 已發送VN數據到系統');
                
            } catch (error) {
                console.error('[JCY-VN通信] 處理VN數據請求失敗:', error);
                
                // 發送錯誤回應
                sendToVNSystem({
                    type: 'VN_ERROR',
                    error: error.message
                });
            }
        }

        // ===== VN內容處理器函數 (必須在handleVNStoryStart之前定義) =====
        
        // 角色名稱對應表
        const characterNameAliases = {
            "雷伊·洛爾德": "雷伊・洛爾德", 
            "雷伊": "雷伊・洛爾德", 
            "Rey": "雷伊・洛爾德", 
            "Rey Lorde": "雷伊・洛爾德", 
            "肯特": "肯斯頓・肯特", 
            "肯斯頓·肯特": "肯斯頓・肯特",   
            "肯斯頓": "肯斯頓・肯特", 
            "Kent": "肯斯頓・肯特", 
            "Keston Kent": "肯斯頓・肯特", 
            "丹": "丹・卡萊爾", 
            "丹·卡萊爾": "丹・卡萊爾", 
            "Dan": "丹・卡萊爾", 
            "Daniel Carlisle": "丹・卡萊爾", 
            "艾迪": "艾迪・克特羅斯", 
            "艾迪·克特羅斯": "艾迪・克特羅斯", 
            "Ade": "艾迪・克特羅斯", 
            "Ade Ketros": "艾迪・克特羅斯", 
            "Eddie": "艾迪・克特羅斯", 
            "Eddie Ketros": "艾迪・克特羅斯", 
            "白則": "白則・貝爾德", 
            "白則·貝爾德": "白則・貝爾德",
            "Baize": "白則・貝爾德", 
            "Baize Baird": "白則・貝爾德", 
            "黎昂·維斯頓": "黎昂・維斯頓",
            "黎昂": "黎昂・維斯頓"
        };

        function parseVNOutput(content) {
            console.log('[JCY-VN解析器] 開始解析VN_TYPE格式:', content.substring(0, 200) + '...');
            
            try {
                const vnData = {
                    dialogues: [],
                    choices: [],
                    narrator: {},
                    charData: {},
                    sceneInfo: {},
                    userData: {
                        hp: "100",
                        san: "100", 
                        distortion: "0",
                        favorabilityList: []
                    }
                };

                // 解析對話區塊
                const dialoguesMatch = content.match(/<dialogues>([\s\S]*?)<\/dialogues>/i);
                if (dialoguesMatch) {
                    vnData.dialogues = parseDialogueBlock(dialoguesMatch[1], vnData, null);
                }

                // 解析選項區塊
                const choicesMatch = content.match(/<choices>([\s\S]*?)<\/choices>/i);
                if (choicesMatch) {
                    vnData.choices = parseChoicesBlock(choicesMatch[1]);
                }

                // 解析角色信息區塊
                const infoMatch = content.match(/<info>([\s\S]*?)<\/info>/i);
                if (infoMatch) {
                    vnData.narrator = parseInfoBlock(infoMatch[1]);
                }

                // 解析角色關係區塊
                const charDataMatch = content.match(/<charadata>([\s\S]*?)<\/charadata>/i);
                if (charDataMatch) {
                    vnData.charData = parseCharDataBlock(charDataMatch[1]);
                }

                // 解析私聊區塊
                const dmListMatches = content.match(/<dm_list_\d+>([\s\S]*?)<\/dm_list_\d+>/gi);
                if (dmListMatches) {
                    console.log('[JCY-VN解析器] 發現私聊區塊:', dmListMatches.length, '個');
                    dmListMatches.forEach((match, index) => {
                        // 提取區塊ID
                        const blockIdMatch = match.match(/<dm_list_(\d+)>/i);
                        const blockId = blockIdMatch ? `dm_list_${blockIdMatch[1]}` : `dm_list_${index + 1}`;
                        
                        const dmContent = match.replace(/<dm_list_\d+>([\s\S]*?)<\/dm_list_\d+>/i, '$1');
                        const dmDialogues = parseDialogueBlock(dmContent, vnData, blockId);
                        vnData.dialogues.push(...dmDialogues);
                    });
                }

                // 解析群聊區塊
                const groupListMatches = content.match(/<group_list_\d+>([\s\S]*?)<\/group_list_\d+>/gi);
                if (groupListMatches) {
                    console.log('[JCY-VN解析器] 發現群聊區塊:', groupListMatches.length, '個');
                    groupListMatches.forEach((match, index) => {
                        // 提取區塊ID
                        const blockIdMatch = match.match(/<group_list_(\d+)>/i);
                        const blockId = blockIdMatch ? `group_list_${blockIdMatch[1]}` : `group_list_${index + 1}`;
                        
                        const groupContent = match.replace(/<group_list_\d+>([\s\S]*?)<\/group_list_\d+>/i, '$1');
                        const groupDialogues = parseDialogueBlock(groupContent, vnData, blockId);
                        vnData.dialogues.push(...groupDialogues);
                    });
                }

                // 解析通話區塊
                const callSectionMatches = content.match(/<call_section>([\s\S]*?)<\/call_section>/gi);
                if (callSectionMatches) {
                    console.log('[JCY-VN解析器] 發現通話區塊:', callSectionMatches.length, '個');
                    callSectionMatches.forEach((match, index) => {
                        const callContent = match.replace(/<call_section>([\s\S]*?)<\/call_section>/i, '$1');
                        const callDialogues = parseDialogueBlock(callContent, vnData, null);
                        vnData.dialogues.push(...callDialogues);
                    });
                }

                // 解析場景信息
                vnData.sceneInfo = parseSceneInfo(content);

                // 統計chat類型的對話數量
                const chatDialogues = vnData.dialogues.filter(d => d.type === 'chat');
                const dmDialogues = chatDialogues.filter(d => d.chatType === 'dm');
                const groupDialogues = chatDialogues.filter(d => d.chatType === 'group_chat');

                console.log('[JCY-VN解析器] 解析完成:', {
                    dialogues: vnData.dialogues.length,
                    chatDialogues: chatDialogues.length,
                    dmDialogues: dmDialogues.length,
                    groupDialogues: groupDialogues.length,
                    choices: vnData.choices.length,
                    hasNarrator: !!vnData.narrator.mainPerspective,
                    hasCharData: !!vnData.charData.rawCharacters
                });

                return vnData;
            } catch (error) {
                console.error('[JCY-VN解析器] 解析失敗:', error);
                // 返回默認結構
                return {
                    dialogues: [{
                        type: 'narrator',
                        content: 'VN劇情載入失敗，請重試',
                        timestamp: Date.now()
                    }],
                    choices: [],
                    narrator: {},
                    charData: {},
                    sceneInfo: {},
                    userData: {
                        hp: "100",
                        san: "100", 
                        distortion: "0",
                        favorabilityList: []
                    }
                };
            }
        }

        function parseDialogueBlock(content, vnData = {}, blockId = null) {
            function getStandardizedName(name) {
                return characterNameAliases[name] || name;
            }
        
            const lines = content.split('\n'); 
            const dialoguesList = []; 
            let orderCounter = 0; 
            const livestreamGroups = {};
            
            for (let i = 0; i < lines.length; i++) {
                const trimmedLine = lines[i].trim(); 
                if (trimmedLine === '') continue; 
                let dialogueEntry = null;
                
                // AREA_TYPE 解析
                const areaMatch = trimmedLine.match(/^\[Area\|([^\]]+)\]$/i);
                if (areaMatch) { 
                    orderCounter++; 
                    dialogueEntry = {
                        originalOrder: orderCounter, 
                        _originalNumbering: `#${orderCounter}`, 
                        type: 'area', 
                        areaName: areaMatch[1].trim()
                    }; 
                }
                
                // TRANSITION_TYPE 解析
                if (!dialogueEntry) {
                    const transitionMatch = trimmedLine.match(/^\[Transition\|([^|]*)\|([^\]]+)\]$/i);
                    if (transitionMatch) { 
                        orderCounter++; 
                        dialogueEntry = { 
                            originalOrder: orderCounter, 
                            _originalNumbering: `#${orderCounter}`, 
                            type: 'transition', 
                            triggerType: transitionMatch[1].trim(), 
                            description: transitionMatch[2].trim(), 
                            content: transitionMatch[2].trim() 
                        }; 
                    }
                }
                
                // BGM_TYPE 解析
                if (!dialogueEntry) {
                    const bgmMatch = trimmedLine.match(/^\[BGM\|([^\]]+)\]$/i);
                    if (bgmMatch) { 
                        orderCounter++; 
                        dialogueEntry = {
                            originalOrder: orderCounter, 
                            _originalNumbering: `#${orderCounter}`, 
                            type: 'bgm', 
                            bgmName: bgmMatch[1].trim()
                        }; 
                    }
                }
                
                // SCENE_TYPE 解析
                if (!dialogueEntry) { 
                    const sceneMatch = trimmedLine.match(/^\[Scene\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\]$/i);
                    if (sceneMatch) { 
                        orderCounter++; 
                        const facilityName = sceneMatch[3].trim();
                        const facilityRoom = sceneMatch[4].trim();
                        
                        dialogueEntry = { 
                            originalOrder: orderCounter, 
                            _originalNumbering: `#${orderCounter}`, 
                            type: 'scene', 
                            date: sceneMatch[1].trim(), 
                            time: sceneMatch[2].trim(), 
                            location: facilityName,
                            facilityName: facilityName,
                            facilityRoom: facilityRoom,
                            backgroundUrl: generateBackgroundUrl(facilityName)
                        }; 
                    }
                }
                
                        // CALL_TYPE 解析 - 修复Call_Narrator显示问题
                if (!dialogueEntry) { 
                    if (trimmedLine === '<call_section>') continue;
                    const callBlockStartMatch = trimmedLine.match(/^\[Call\|([^:]+):\s*$/i);
                    if (callBlockStartMatch) { 
                        const callDirection = callBlockStartMatch[1].trim(); 
                        const callMessages = []; 
                        let j = i + 1; 
                        let callBlockFinished = false;
                        
                        while (j < lines.length && !callBlockFinished) {
                            const nextLineTrimmed = lines[j].trim(); 
                            if (nextLineTrimmed === '') { j++; continue; }
                            if (nextLineTrimmed === ']' || nextLineTrimmed === '</call_section>') { 
                                callBlockFinished = true; 
                                break; 
                            }
                            
                            // 【修复】Call_Narrator格式解析 - 有音效格式
                            let callNarrM = nextLineTrimmed.match(/^#(\d+)\s*\|\s*Call_Narrator\s*\|\s*([^|]+?)\s*\|\s*([^|]*)$/i);
                            // 【修复】Call_Narrator格式解析 - 无音效格式  
                            let callNarrMNoSound = nextLineTrimmed.match(/^#(\d+)\s*\|\s*Call_Narrator\s*\|\s*([^|]+?)$/i);
                            
                            // 普通角色通话消息解析
                            let callMsgM = nextLineTrimmed.match(/^#(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*)$/i);
                            let callMsgMNoSound = nextLineTrimmed.match(/^#(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)$/i);
                            
                            if (callNarrM) {
                                // 【修复】只取内容部分，不包含格式字符串
                                console.log(`[VN处理器-简化版] 解析Call_Narrator (有音效): 内容="${callNarrM[2].trim()}" 音效="${callNarrM[3]?.trim() || 'none'}"`);
                                callMessages.push({ 
                                    messageOrder: parseInt(callNarrM[1]), 
                                    facility: 'Call_Narrator', 
                                    speaker: 'Call_Narrator', 
                                    content: callNarrM[2].trim(), // 只取内容部分
                                    position: 'center', 
                                    isCallNarrator: true, 
                                    soundEffect: processSoundEffects(callNarrM[3] ? callNarrM[3].trim() : 'none') 
                                });
                            } else if (callNarrMNoSound) {
                                // 【修复】只取内容部分，不包含格式字符串
                                console.log(`[VN处理器-简化版] 解析Call_Narrator (无音效): 内容="${callNarrMNoSound[2].trim()}"`);
                                callMessages.push({ 
                                    messageOrder: parseInt(callNarrMNoSound[1]), 
                                    facility: 'Call_Narrator', 
                                    speaker: 'Call_Narrator', 
                                    content: callNarrMNoSound[2].trim(), // 只取内容部分
                                    position: 'center', 
                                    isCallNarrator: true, 
                                    soundEffect: processSoundEffects('') 
                                });
                            } else if (callMsgM) {
                                callMessages.push({ 
                                    messageOrder: parseInt(callMsgM[1]), 
                                    facility: callMsgM[2].trim(), 
                                    speaker: callMsgM[3].trim(), 
                                    content: callMsgM[4].trim(), 
                                    position: (callMsgM[3].trim()===vnData.narrator?.mainPerspective||callMsgM[3].trim()==='主角'?'right':'left'), 
                                    isCallNarrator: false, 
                                    soundEffect: processSoundEffects(callMsgM[5]?callMsgM[5].trim():'none') 
                                });
                            } else if (callMsgMNoSound) {
                                callMessages.push({ 
                                    messageOrder: parseInt(callMsgMNoSound[1]), 
                                    facility: callMsgMNoSound[2].trim(), 
                                    speaker: callMsgMNoSound[3].trim(), 
                                    content: callMsgMNoSound[4].trim(), 
                                    position: (callMsgMNoSound[3].trim()===vnData.narrator?.mainPerspective||callMsgMNoSound[3].trim()==='主角'?'right':'left'), 
                                    isCallNarrator: false, 
                                    soundEffect: processSoundEffects('') 
                                });
                            } else {
                                // 【新增】防止未匹配的Call_Narrator行被错误处理
                                if (nextLineTrimmed.includes('Call_Narrator')) {
                                    console.warn(`[VN处理器-简化版] Call_Narrator格式不匹配，跳过行: ${nextLineTrimmed}`);
                                }
                            }
                            j++;
                        }
                        
                        if (callMessages.length > 0) { 
                            orderCounter++; 
                            dialogueEntry = {
                                originalOrder: orderCounter,
                                _originalNumbering: `#${orderCounter}`,
                                type: 'call',
                                callDirection: callDirection,
                                callMessages: callMessages,
                                name: callMessages.find(msg=>!msg.isCallNarrator)?.speaker||'Unknown',
                                content: `通话:${callDirection}`,
                                messageCount: callMessages.length
                            };
                        }
                        i = j; 
                        if (dialogueEntry) { 
                            dialoguesList.push(dialogueEntry); 
                            continue; 
                        }
                    }
                }
                
                // NARRATOR 解析
                if (!dialogueEntry) { 
                    let narrMatch = trimmedLine.match(/^\s*\[Narrator\|([\s\S]+?)\|([^\]]*)\]\s*$/i);
                    if (narrMatch) { 
                        orderCounter++; 
                        dialogueEntry = {
                            originalOrder: orderCounter,
                            _originalNumbering: `#${orderCounter}`,
                            type: 'narrative',
                            content: narrMatch[1].trim(),
                            soundEffect: processSoundEffects(narrMatch[2].trim())
                        }; 
                        // console.log(`[VN处理器-简化版] 解析Narrator (有音效格): ${narrMatch[1].trim().substring(0, 50)}...`);
                    } else {
                        narrMatch = trimmedLine.match(/^\s*\[Narrator\|([\s\S]+?)\]\s*$/i);
                        if (narrMatch) { 
                            orderCounter++; 
                            dialogueEntry = {
                                originalOrder: orderCounter,
                                _originalNumbering: `#${orderCounter}`,
                                type: 'narrative',
                                content: narrMatch[1].trim(),
                                soundEffect: processSoundEffects('')
                            }; 
                            // console.log(`[VN处理器-简化版] 解析Narrator (无音效格): ${narrMatch[1].trim().substring(0, 50)}...`);
                        }
                    }
                }
                
                // ITEM 解析
                if (!dialogueEntry) {
                    const itemMatch = trimmedLine.match(/^\[Item\|([^|]+)\|([^|]+)\|([^\]]+)\]$/i);
                    if (itemMatch) { 
                        orderCounter++; 
                        const itemUrls = generateItemImageUrl(itemMatch[1].trim(), itemMatch[2].trim());
                        dialogueEntry = {
                            originalOrder: orderCounter, 
                            _originalNumbering: `#${orderCounter}`, 
                            type: 'item', 
                            itemType: itemMatch[1].trim(),
                            itemName: itemMatch[2].trim(),
                            itemDescription: itemMatch[3].trim(),
                            content: `物品: ${itemMatch[2].trim()}`,
                            itemImageUrl: itemUrls.primaryUrl,
                            itemFallbackUrl: itemUrls.fallbackUrl
                        }; 
                        // console.log(`[VN处理器-简化版] 解析Item: ${itemMatch[2].trim()} (${itemMatch[1].trim()})`);
                    }
                }
        
        
                // CHARACTER 解析
                if (!dialogueEntry) { 
                    let charMatch = trimmedLine.match(/^\s*\[([^|]+?)\|([^|]*)\|([^|]*)\|([\s\S]+?)\|([^\]]*)\](\s*\[離開\])?\s*$/i);
                    if (charMatch) {
                        const originalCharName = charMatch[1].trim(); 
                        const charName = getStandardizedName(originalCharName);
                        
                        const cost = charMatch[2].trim(); 
                        const expr = charMatch[3].trim(); 
                        const dialCont = charMatch[4].trim(); 
                        const sEStr = charMatch[5].trim(); 
                        const exit = charMatch[6];
                        orderCounter++;
                        const type = (charName === vnData.narrator?.mainPerspective || charName === '主角') ? 'protagonist' : 'character';
                        
                        dialogueEntry = { 
                            originalOrder: orderCounter, 
                            _originalNumbering: `#${orderCounter}`, 
                            type: type, 
                            name: charName,
                            outfit: cost, 
                            expression: expr, 
                            content: dialCont, 
                            soundEffect: processSoundEffects(sEStr), 
                            action: exit ? 'exit' : null, 
                            characterImageUrl: getCharacterImageUrl(charName, expr)
                        };
                        // console.log(`[VN处理器-简化版] 解析Character (有音效格): ${charName} - ${dialCont.substring(0, 30)}...`);
                    } else {
                        charMatch = trimmedLine.match(/^\s*\[([^|]+?)\|([^|]*)\|([^|]*)\|([\s\S]+?)\](\s*\[離開\])?\s*$/i);
                        if (charMatch) {
                            const originalCharName = charMatch[1].trim(); 
                            const charName = getStandardizedName(originalCharName);
                            
                            const cost = charMatch[2].trim(); 
                            const expr = charMatch[3].trim(); 
                            const dialCont = charMatch[4].trim(); 
                            const exit = charMatch[5];
                            orderCounter++;
                            const type = (charName === vnData.narrator?.mainPerspective || charName === '主角') ? 'protagonist' : 'character';
                            
                            dialogueEntry = { 
                                originalOrder: orderCounter, 
                                _originalNumbering: `#${orderCounter}`, 
                                type: type, 
                                name: charName,
                                outfit: cost, 
                                expression: expr, 
                                content: dialCont, 
                                soundEffect: processSoundEffects(''), 
                                action: exit ? 'exit' : null, 
                                characterImageUrl: getCharacterImageUrl(charName, expr)
                            };
                            // console.log(`[VN处理器-简化版] 解析Character (无音效格): ${charName} - ${dialCont.substring(0, 30)}...`);
                        }
                    }
                }
                
                // ECHO 解析
                if (!dialogueEntry) { 
                    const echoMatch = trimmedLine.match(/^\[Echo\|([\s\S]*?)\]$/i); 
                    if (echoMatch) { 
                        orderCounter++; 
                        dialogueEntry = {
                            originalOrder: orderCounter, 
                            _originalNumbering: `#${orderCounter}`, 
                            type: 'echo', 
                            content: trimmedLine, 
                            rawParams: echoMatch[1]
                        };
                    }
                }
                
        
                
                // CHAT 解析 - 在區塊內容中解析
                if (!dialogueEntry && trimmedLine.startsWith('[Chat|')) { 
                    console.log('[JCY-VN解析器-Debug] 檢測到Chat行:', trimmedLine);
                    // 檢查是否在專門的區塊中（dm_list_或group_list_）
                    const isInSpecialBlock = content.includes('<dm_list_') || content.includes('<group_list_');
                    console.log('[JCY-VN解析器-Debug] isInSpecialBlock:', isInSpecialBlock, 'blockId:', blockId);
                    
                    // 在專門區塊中進行chat解析
                    if (isInSpecialBlock) {
                        try { 
                            const bIM = trimmedLine.match(/^\[Chat\|([^|]+)\|([^|]+)\|([^|]+)\|([^:]+):(.*)$/i); 
                            if(bIM){
                                let cT=bIM[1].trim().toLowerCase(); 
                                const cN=bIM[2].trim(); 
                                const admin=bIM[3].trim(); 
                                const p=bIM[4].trim(); 
                                let fLM=bIM[5]?bIM[5].trim():''; 
                                
                                // 使用傳入的blockId，如果沒有則使用默認值
                                const lId = blockId || (cT === 'dm' ? 'dm_list_1' : 'group_list_1');
                                
                                if(cT!=='dm'&&cT!=='group_chat'){
                                    if(lId.startsWith('dm_'))cT='dm';
                                    else if(lId.startsWith('group_'))cT='group_chat';
                                } 
                                
                                let sML=[]; 
                                let j=i+1; 
                                const eT=`</${lId}>`; 
                                
                                while(j<lines.length&&!lines[j].trim().startsWith('[')){
                                    let cLC=lines[j].trim(); 
                                    let bL=false; 
                                    if(cLC.includes(eT)){
                                        cLC=cLC.substring(0,cLC.lastIndexOf(eT));
                                        bL=true;
                                    } 
                                    if(cLC)sML.push(lines[j]); 
                                    if(bL){j++;break;} 
                                    j++;
                                } 
                                i=j-1; 
                                
                                let aCFM=fLM; 
                                if(sML.length>0){
                                    if(aCFM!=='')aCFM+='\n';
                                    aCFM+=sML.join('\n');
                                } 
                                
                                const eM=extractMessagesFromChatContent(aCFM,lId,cT); 
                                orderCounter++; 
                                dialogueEntry={
                                    id:`chat_${lId}_${orderCounter}`,
                                    originalOrder:orderCounter,
                                    _originalNumbering:`#${orderCounter}`,
                                    type:'chat',
                                    chatType:cT,
                                    chatId:lId,
                                    listId:lId,
                                    chatName:cN,
                                    participants:p,
                                    content:aCFM,
                                    messagesList:eM,
                                    isSpeaking:false
                                };
                            }
                        }catch(err){
                            console.error("Chat parsing error:", err);
                        }
                    }
                }
                
                // LIVESTREAM 解析
                if (!dialogueEntry) { 
                    const audCCM=trimmedLine.match(/^\[live_stream\|([^|]+)\|audience_chat:$/i); 
                    if(audCCM){ 
                        const sessId=audCCM[1]; 
                        let cMA=[]; 
                        let k=i+1; 
                        let fEM=false; 
                        
                        while(k<lines.length){ 
                            const nLT=lines[k].trim(); 
                            if(nLT===''){k++;continue;} 
                            if(nLT===']'){fEM=true;break;} 
                            if(nLT.startsWith('#ls_'))cMA.push(nLT); 
                            k++;
                        } 
                        i=fEM?k:k-1; 
                        
                        const lsEv=`[live_stream|${sessId}|audience_chat|${cMA.join('|')}]`; 
                        if(livestreamGroups[sessId])livestreamGroups[sessId].events.push(lsEv); 
                        else livestreamGroups[sessId]={sessionId:sessId,events:[lsEv],orderCounter:++orderCounter};
                    } else {
                        const lsM=trimmedLine.match(/^\[live_stream\|(.*?)\]$/i); 
                        if(lsM){
                            const lsSID=lsM[1].split('|')[0].trim(); 
                            if(livestreamGroups[lsSID])livestreamGroups[lsSID].events.push(trimmedLine); 
                            else livestreamGroups[lsSID]={sessionId:lsSID,events:[trimmedLine],orderCounter:++orderCounter};
                        }
                    }
                }
                
                if (dialogueEntry) dialoguesList.push(dialogueEntry);
            }
            
            Object.values(livestreamGroups).forEach(g => 
                dialoguesList.push({
                    originalOrder:g.orderCounter,
                    _originalNumbering:`#${g.orderCounter}`,
                    type:'livestream',
                    livestreamSessionId:g.sessionId,
                    livestreamEvents:g.events,
                    isLastLivestreamEvent:true
                })
            );
            
            dialoguesList.sort((a,b)=>a.originalOrder-b.originalOrder);
            return dialoguesList;
        }



        function generateCharacterImageUrl(characterName, expression) {
            if (!characterName) return '';
            const cleanName = characterName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
            const cleanExpression = expression ? expression.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '') : '';
            const expressionSuffix = cleanExpression ? `_${cleanExpression}` : '';
            return `https://nancywang3641.github.io/sound-files/char_img/${cleanName}${expressionSuffix}.png`;
        }

        // 添加聊天室消息解析函数
        function extractMessagesFromChatContent(chatContent, parentChatId, parentChatType) {
                    if (!chatContent) return [];
                    
                    const messages = [];
                    const lines = chatContent.split('\n');
                    const today = new Date();
                    const currentDate = String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
                    const currentTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
                    
                    for (const line of lines) { 
                        const tL = line.trim(); 
                        if (!tL || !(tL.startsWith('#') || tL.startsWith('|#'))) continue; 
                        
                        try {
                            const cLFP = tL.startsWith('|') ? tL.substring(1) : tL; 
                            const pts = cLFP.split('|').map(p => p.trim()); 
                            if (pts.length < 3) continue; 
                            
                            const mN = pts[0].replace('#', '').trim(); 
                            let s = pts[1]; 
                            let c = pts[2]; 
                            
                            // 中文格式类型检测（向后兼容英文）
                            let ty = 'none';
                            
                            // 检测语音 (中文优先，兼容英文)
                            if (c.includes('[语音:') || c.includes('[語音:') || c.includes('[voice:')) ty = 'voice';
                            // 检测图片/照片 (中文优先，兼容英文)
                            else if (c.includes('[照片:') || c.includes('[圖片:') || c.includes('[图片:') || c.includes('[photo:') || c.includes('[image:')) ty = 'photo';
                            // 检测文件 (中文优先，兼容英文)
                            else if (c.includes('[文件:') || c.includes('[檔案:') || c.includes('[file:')) ty = 'file';
                            // 检测投票 (中文优先，兼容英文)
                            else if (c.includes('[投票:') || c.includes('[poll:')) ty = 'poll';
                            // 检测贴纸 (中文优先，兼容英文)
                            else if (c.includes('[贴纸:') || c.includes('[貼紙:') || c.includes('[sticker:')) ty = 'sticker';
                            // 检测红包
                            else if (c.includes('🧧') || c.match(/-\s*🧧/)) ty = 'red_envelope';
                            // 其他中文功能格式 [xxx:yyy] 都识别为function
                            else if (/\[[^:\]]+[:：][^\]]+\]/.test(c)) ty = 'function';
                            
                            let d = pts.length > 3 && pts[3] ? pts[3].trim() : currentDate; 
                            let tm = pts.length > 4 && pts[4] ? pts[4].trim() : currentTime; 
                            let st = pts.length > 5 && pts[5] ? pts[5].trim() : ''; 
                            
                            if (!d.match(/^\d{2}-\d{2}$/) && d !== "今天" && d !== "昨天") d = currentDate;
                            if (d.match(/^\d{2}-\d{2}$/)) d = `2025-${d}`;
                            if (!tm.match(/^\d{2}:\d{2}$/)) tm = currentTime;
                            
                            let rC = 0; 
                            if (st.includes('已读') || st.includes('已讀')) {
                                const rM = st.match(/已[读讀]\s*(\d+)?/);
                                rC = rM ? (rM[1] ? parseInt(rM[1]) : (parentChatType === 'dm' ? 1 : 0)) : (parentChatType === 'dm' ? 1 : 0);
                                if (parentChatType === 'dm' && (st === '已读' || st === '已讀')) rC = 1;
                            } 
                            
                            messages.push({
                                id: `msg_${parentChatId}_${mN}`,
                                number: mN,
                                sender: s,
                                content: c,
                                type: ty,
                                date: d,
                                time: tm,
                                status: st,
                                readCount: rC,
                                chatId: parentChatId,
                                chatType: parentChatType
                            });
                        } catch (err) {
                            console.error("Chat message extraction error:", err);
                        }
                    } 
                    return messages;
        }

        function parseChoicesBlock(content) {
            const choices = [];
            const lines = content.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                // 支持 VN_TYPE 格式：[1️⃣ [直接掛斷去睡覺] | 描述 | 結果]
                const choiceMatch = line.match(/^\[([^|]+)\s*\[([^\]]+)\]\s*\|\s*([^|]+?)\s*\|\s*([^\]]+?)\]$/);
                if (choiceMatch) {
                    choices.push({
                        number: choiceMatch[1].trim(), // 1️⃣, 2️⃣, 3️⃣ 等
                        text: choiceMatch[2].trim(),   // 選項文字
                        description: choiceMatch[3].trim(),
                        result: choiceMatch[4].trim(),
                        timestamp: Date.now()
                    });
                }
            }
            
            return choices;
        }

        function parseInfoBlock(content) {
            const narratorInfo = {};
            const lines = content.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                const perspectiveMatch = line.match(/^\[main_perspective\]:(.+)$/i);
                if (perspectiveMatch) {
                    narratorInfo.mainPerspective = perspectiveMatch[1].trim();
                }
                
                const charactersMatch = line.match(/^\[current_scene_characters\]:(.+)$/i);
                if (charactersMatch) {
                    narratorInfo.currentSceneCharacters = charactersMatch[1].trim().split(',').map(s => s.trim());
                }
            }
            
            return narratorInfo;
        }

        function parseCharDataBlock(content) {
            const charData = {};
            const lines = content.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                const charMatch = line.match(/^\[([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]$/);
                if (charMatch) {
                    const charName = charMatch[1].trim();
                    charData[charName] = {
                        name: charName,
                        personality: charMatch[2].trim(),
                        relationship: charMatch[3].trim(),
                        status: charMatch[4].trim()
                    };
                }
            }
            
            return charData;
        }

        function parseSceneInfo(message) {
            const sceneInfo = {
                subEvents: [],
                memoryNotes: []
            };
            
            // 嘗試新格式 <info> 或舊格式 <StatusBlock>
            let m = message.match(/<StatusBlock>([\s\S]*?)<\/StatusBlock>/i);
            
            if (m && m[1]) {
                const c = m[1].trim();
                const sLR = /^\[([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/m;
                const sM = c.match(sLR);
                if (sM) {
                    sceneInfo.dateStatus = sM[1].trim();
                    sceneInfo.timeStatus = sM[2].trim();
                    sceneInfo.locationStatus = sM[3].trim();
                }
                
                const eCR = /\[sub_event_check:\s*#([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^\]]+?)\]/g;
                let eCM;
                while ((eCM = eCR.exec(c)) !== null) {
                    sceneInfo.subEvents.push({
                        id: eCM[1].trim(),
                        name: eCM[2].trim(),
                        description: eCM[3].trim(),
                        status: eCM[4].trim()
                    });
                }
                
                const mNR = /\[memory_note:\s*([^|]+?)\s*\|\s*From:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^\]]+?)\]/g;
                let mNM;
                while ((mNM = mNR.exec(c)) !== null) {
                    sceneInfo.memoryNotes.push({
                        title: mNM[1].trim(),
                        source: mNM[2].trim(),
                        date: mNM[3].trim(),
                        type: mNM[4].trim(),
                        content: mNM[5].trim()
                    });
                }
            }
            return sceneInfo;
        }

        function generateBackgroundUrl(location) {
            if (!location) return 'https://nancywang3641.github.io/sound-files/location_img/default.jpeg';
            const cleanLocation = location.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
            return `https://nancywang3641.github.io/sound-files/location_img/${cleanLocation}.jpeg`;
        }

        function generateItemImageUrl(itemType, itemName) {
            if (!itemType || !itemName) return { primaryUrl: '', fallbackUrl: '' };
            const cleanType = itemType.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
            const cleanName = itemName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
            const primaryUrl = `https://nancywang3641.github.io/sound-files/item_img/${cleanType}_${cleanName}.png`;
            const fallbackUrl = `https://nancywang3641.github.io/sound-files/item_type/${cleanType}.png`;
            return { primaryUrl, fallbackUrl };
        }

        function processSoundEffects(soundEffect) {
            if (!soundEffect || soundEffect.trim() === '' || soundEffect.toLowerCase() === 'none') return undefined;
            const soundEffects = soundEffect.split(',').map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none');
            if (soundEffects.length === 0) return undefined;
            return soundEffects.length === 1 ? soundEffects[0] : soundEffects;
        }

        function getCharacterImageUrl(characterName, expression) {
            const cleanCharacterName = (characterName || 'default').trim();
            const cleanExpression = (expression || '').trim();
            
            // 優先使用VN面板的立繪設置
            if (window.VNPortraitProcessor && window.VNPortraitProcessor.generatePortraitUrl) {
                try {
                    const portraitUrl = window.VNPortraitProcessor.generatePortraitUrl(cleanCharacterName);
                    if (portraitUrl) {
                        console.log(`[JCY-VN解析器] 使用VN面板立繪設置: ${cleanCharacterName} -> ${portraitUrl}`);
                        return portraitUrl;
                    }
                } catch (error) {
                    console.warn(`[JCY-VN解析器] VN面板立繪設置失敗，使用預設:`, error);
                }
            }
            
            // 備用：使用預設的立繪URL生成邏輯
            if (cleanExpression && cleanExpression !== cleanCharacterName) {
                return `https://nancywang3641.github.io/sound-files/char_img/${cleanCharacterName}_${cleanExpression}.png`;
            } else if (cleanExpression) {
                return `https://nancywang3641.github.io/sound-files/char_img/${cleanExpression}.png`;
            } else {
                return `https://nancywang3641.github.io/sound-files/char_img/${cleanCharacterName}.png`;
            }
        }

        // 獲取當前實際使用的VN系統提示詞
        function getCurrentVNSystemPrompt() {
            // 嘗試從localStorage獲取用戶自定義的提示詞
            try {
                const savedSettings = localStorage.getItem('jcy_prompt_settings');
                if (savedSettings) {
                    const settings = JSON.parse(savedSettings);
                    if (settings.vnPrompt && settings.vnPrompt.trim()) {
                        console.log('[JCY-VN] 使用用戶自定義的VN提示詞');
                        return settings.vnPrompt;
                    }
                }
            } catch (error) {
                console.warn('[JCY-VN] 載入用戶自定義提示詞失敗，使用默認提示詞:', error);
            }
            
            // 返回默認提示詞
            return `你是一個VN劇情生成助手。請嚴格按照VN_TYPE格式回應，生成VN劇情內容。

# VN劇情生成規則
- 根據用戶提供的劇情設定生成豐富的劇情內容
- 包含角色對話、旁白、場景描述
- 支持多種劇情類型（日常、冒險、戀愛等）
- 根據角色設定調整對話風格

# 重要格式要求：
1. 必須使用VN_TYPE的標準格式
2. 角色對話格式：[角色名|服裝|表情|對話|sound_effect]
3. 旁白格式：[Narrator|描述|sound_effect]
4. 場景格式：[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
5. 背景音樂格式：[BGM|bgm_name]
6. 展示物品格式: [Item|類型|物品名稱|物品描述]
7. 通話格式:
  <call_section>
  [Call|發送者→接收者:
  #n |位置|角色名|通話內容|音效/none
  #n |Call_Narrator|電話那頭傳來肯特疑惑的聲音。|none
  ...
  </call_section> 
8. 聊天室格式: 
CHAT_TYPE_RULES: 所有 CHAT_TYPE 段落，只要進入 chat 內容，開頭都必須以 [Chat|...|... 起始，並包在 <dm_list_1> /<group_list_1> 區塊中。
    
私聊專屬格式:
        <dm_list_1>
        [Chat|dm|與角色B的私訊|角色A, 角色B:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </dm_list_1>

群聊專屬格式:
        <group_list_1>
        [Chat|group|群聊名稱|管理員名稱|角色A, 角色B, 角色C...:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </group_list_1>

9. 選項格式，必須輸出4條選項：[1️⃣ [選項文字] | 選項描述 | 選項結果]

# 輸出格式結構
你的回應必須包含以下完整結構：

\`\`\`
<dialogues>
[Story|STORY_ID]
[Area|AREA_A_DAY]
[BGM|bgm_name]
[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
[Narrator|描述|sound_effect]
[角色名|服裝|表情|對話|sound_effect]

依據段落內容，請在段落內容後面加上<!--run:引用的推进1内容: 推进描写:专家描写:-->
<!--run:引用的推进1内容: 
推进描写:
专家描写:
-->
<!--run:引用的推进2内容: 
推进描写:
专家描写:
-->
<!--run:引用的推进3内容: 
推进描写:
专家描写:
-->

[End|STORY_ID]
</dialogues>

<choices>
[1️⃣ [選項文字] | 選項描述 | 選項結果]
</choices>
\`\`\`

請確保回應格式完全符合VN_TYPE的規範，不要使用其他格式。`;
        }

        // 處理世界書排序和觸發邏輯
        function processWorldBooksForPrompt(worldBooks, userInput = '') {
            if (!Array.isArray(worldBooks) || worldBooks.length === 0) {
                return [];
            }
            
            // 過濾觸發條件
            const filteredWorldBooks = worldBooks.filter(wb => {
                if (wb.trigger === 'Always On') {
                    return true;
                } else if (wb.trigger === 'Keywords' && wb.keywords) {
                    // 檢查用戶輸入是否包含關鍵字
                    const keywords = wb.keywords.split(',').map(k => k.trim().toLowerCase());
                    const inputLower = userInput.toLowerCase();
                    return keywords.some(keyword => inputLower.includes(keyword));
                }
                return false;
            });
            
            // 按分類和優先級排序
            const sortedWorldBooks = filteredWorldBooks.sort((a, b) => {
                // 首先按分類排序：系統 > 備註
                const categoryOrder = { '系統': 0, '備註': 1 };
                const categoryDiff = (categoryOrder[a.category] || 1) - (categoryOrder[b.category] || 1);
                if (categoryDiff !== 0) return categoryDiff;
                
                // 然後按優先級和分類排序
                const sortOrder = {
                    '系統最重要': 0,
                    '系統重要': 1,
                    '系統普通': 2,
                    '備註最重要': 3,
                    '備註重要': 4,
                    '備註普通': 5
                };
                const aKey = `${a.category}${a.priority}`;
                const bKey = `${b.category}${b.priority}`;
                const aOrder = sortOrder[aKey] || 999;
                const bOrder = sortOrder[bKey] || 999;
                return aOrder - bOrder;
            });
            
            console.log('[JCY-VN] 世界書處理結果:', {
                original: worldBooks.length,
                filtered: filteredWorldBooks.length,
                sorted: sortedWorldBooks.length,
                userInput: userInput
            });
            
            return sortedWorldBooks;
        }

        // 處理VN劇情開始請求
        async function handleVNStoryStart(data) {
            try {
                console.log('[JCY-VN通信] 開始處理VN劇情:', data.story.title);
                console.log('[JCY-VN通信] 接收到的數據:', {
                    story: data.story?.title,
                    characters: data.characters,
                    worldBooks: data.worldBooks,
                    portraitConfig: data.portraitConfig
                });
                
                // 詳細調試世界書數據
                console.log('[JCY-VN通信] 世界書數據詳細分析:', {
                    receivedWorldBooks: data.worldBooks,
                    worldBooksType: typeof data.worldBooks,
                    worldBooksIsArray: Array.isArray(data.worldBooks),
                    worldBooksLength: data.worldBooks ? data.worldBooks.length : 0,
                    worldBooksContent: data.worldBooks ? data.worldBooks.map(wb => ({
                        id: wb.id,
                        name: wb.name,
                        contentLength: wb.content ? wb.content.length : 0
                    })) : []
                });
                
                const { story, characters, portraitConfig, worldBooks } = data;
                
                // 通過postMessage安全地配置VN立繪處理器
                let vnIframe = document.getElementById('vn-iframe');
                if (vnIframe && vnIframe.contentWindow) {
                    // 發送配置消息到VN面板
                    vnIframe.contentWindow.postMessage({
                        type: 'VN_CONFIGURE_PORTRAIT',
                        config: {
                            baseUrl: portraitConfig.baseUrl,
                            format: portraitConfig.format
                        }
                    }, '*');
                    console.log('[JCY-VN通信] 已發送VN立繪配置');
                } else {
                    console.warn('[JCY-VN通信] VN面板iframe未找到或未準備好');
                }
                
                // 處理世界書排序和觸發邏輯
                const processedWorldBooks = processWorldBooksForPrompt(worldBooks || [], '');
                
                // 構建劇情開始的提示詞
                const storyPrompt = await getCurrentVNStoryStartPrompt(story, characters, portraitConfig, worldBooks || [], '');
                
                // 獲取歷史劇情內容
                const historyContent = getVNHistoryContent(story.title);
                
                // 構建完整的開始劇情提示詞
                const fullStoryPrompt = `=== SYSTEM MESSAGE ===
你是視覺小說AI，請遵循以下設定：
[🎯 劇情提示詞]
${story.content || '請開始劇情'}

[🎬 開場白]
${story.opening || '請開始劇情'}

=== SYSTEM PROMPT ===
${getCurrentVNSystemPrompt()}

=== WORLD BOOKS(系統) ===
${generateWorldBookSection(processedWorldBooks.filter(wb => wb.category === '系統'))}

=== CHARACTER CARD ===
${generateCharacterSection(characters)}

=== WORLD BOOKS(備註) ===
${generateWorldBookSection(processedWorldBooks.filter(wb => wb.category === '備註'))}

=== HISTORY MESSAGE ===
${historyContent}

=== USER MESSAGE ===  
[開始劇情]

請開始生成VN劇情內容。`;

                // 檢查API配置
                console.log('[JCY-VN通信] 檢查API配置:', {
                    hasApiKey: !!state.apiConfig.apiKey,
                    hasProxyUrl: !!state.apiConfig.proxyUrl,
                    hasModel: !!state.apiConfig.model,
                    config: state.apiConfig
                });
                
                if (!state.apiConfig.apiKey || !state.apiConfig.proxyUrl) {
                    throw new Error('API配置不完整，請先在設置中配置API密鑰和代理地址');
                }
                
                // 調用AI生成劇情
                console.log('[JCY-VN通信] 開始調用AI API...');
                
                // 為VN系統創建專門的AI調用
                const vnSystemPrompt = `你是一個VN劇情生成助手。請嚴格按照VN_TYPE格式回應，生成VN劇情內容。

${fullStoryPrompt}

## 重要格式要求：
1. 必須使用VN的標準格式
2. 角色對話格式：[角色名|服裝|表情|對話|sound_effect]
3. 旁白格式：[Narrator|描述|sound_effect]
4. 場景格式：[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
5. 背景音樂格式：[BGM|bgm_name]
6. 展示物品格式: [Item|類型|物品名稱|物品描述]
7. 通話格式:
  <call_section>
  [Call|發送者→接收者:
  #n |位置|角色名|通話內容|音效/none
  #n |Call_Narrator|電話那頭傳來肯特疑惑的聲音。|none
  ...
  </call_section> 
8. 聊天室格式: 
CHAT_TYPE_RULES: 所有 CHAT_TYPE 段落，只要進入 chat 內容，開頭都必須以 [Chat|...|... 起始，並包在 <dm_list_1> /<group_list_1> 區塊中。
        私聊專屬格式:
        <dm_list_1>
        [Chat|dm|與角色B的私訊|角色A|角色A, 角色B:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </dm_list_1>

        群聊專屬格式:
        <group_list_1>
        [Chat|group|群聊名稱|管理員名稱|角色A, 角色B, 角色C...:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </group_list_1>

9. 選項格式，必須輸出4條選項：[1️⃣ [選項文字] | 選項描述 | 選項結果]

請確保回應格式完全符合VN的規範，不要使用其他格式。`;

                const aiResponse = await callApiUnified([
                    { role: 'system', content: `你是一個VN劇情生成助手。你必須嚴格按照VN_TYPE格式回應。

## 重要：必須使用完整的VN_TYPE格式結構

你的回應必須包含以下完整結構：

\`\`\`
<dialogues>
[Story|STORY_ID]
[Area|AREA_A_DAY]
[BGM|bgm_name]
[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]

[Narrator|描述|sound_effect]
[角色名|服裝|表情|對話|sound_effect]

依據段落內容，請在段落內容後面加上<!--run:引用的推进1内容: 推进描写:专家描写:-->
<!--run:引用的推进1内容: 
推进描写:
专家描写:
-->
<!--run:引用的推进2内容: 
推进描写:
专家描写:
-->
<!--run:引用的推进3内容: 
推进描写:
专家描写:
-->

[End|STORY_ID]
</dialogues>

<choices>
[編號表情 [選項文字] | 選項描述 | 選項結果]
</choices>
\`\`\`

## 格式要求：
1. 必須以 \`<dialogues>\` 開始，以 \`</dialogues>\` 結束
2. 必須包含 \`[Story|STORY_ID]\` 和 \`[End|STORY_ID]\`
3. 角色對話：\`[角色名|服裝|表情|對話|sound_effect]\`
4. 旁白：\`[Narrator|描述|sound_effect]\`
5. 場景：\`[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]\`
6. 背景音樂：\`[BGM|bgm_name]\`

請不要只輸出單獨的標籤，必須使用完整的VN_TYPE格式結構。` },
                    { role: 'user', content: vnSystemPrompt }
                ], 0.8);
                
                console.log('[JCY-VN通信] AI回應:', aiResponse);
                
                // 解析AI回應的VN格式
                const parsedVNData = parseVNOutput(aiResponse);
                console.log('[JCY-VN通信] 解析後的VN數據:', parsedVNData);
                
                // 將解析後的數據發送到VN面板
                vnIframe = document.getElementById('vn-iframe');
                if (vnIframe && vnIframe.contentWindow) {
                    vnIframe.contentWindow.postMessage({
                        type: 'VN_DATA',
                        data: parsedVNData,
                        messageId: 'story_start_' + Date.now()
                    }, '*');
                    console.log('[JCY-VN通信] 已發送解析後的VN數據到VN面板');
                    
                    // 保存到歷史記錄
                    try {
                        // 構建完整的storyData對象，包含所有必要信息
                        const storyData = {
                            title: story.title,
                            description: story.description,
                            content: story.content,
                            opening: story.opening,
                            characters: characters,
                            worldBooks: data.worldBooks || [],
                            characterPresetsUrl: portraitConfig.baseUrl,
                            characterPresetsFormat: portraitConfig.format
                        };
                        
                        // 保存時包含完整提示詞
                        const storyDataWithPrompt = {
                            ...storyData,
                            fullPrompt: fullStoryPrompt
                        };
                        
                        await saveVNStoryToHistory(storyDataWithPrompt, aiResponse, parsedVNData);
                        
                        // 保存到localStorage歷史劇情
                        saveVNHistoryToLocalStorage(story.title, aiResponse);
                        
                        console.log('[JCY-VN通信] 劇情已保存到歷史記錄');
                    } catch (error) {
                        console.warn('[JCY-VN通信] 保存歷史記錄失敗:', error);
                    }
                } else {
                    console.error('[JCY-VN通信] VN面板iframe未找到或未準備好，無法發送數據');
                }
                
                console.log('[JCY-VN通信] VN劇情已開始');
                
            } catch (error) {
                console.error('[JCY-VN通信] 處理VN劇情開始失敗:', error);
                
                // 顯示用戶友好的錯誤信息
                showCustomAlert('VN劇情啟動失敗', `無法啟動VN劇情：${error.message}\n\n請檢查VN面板是否正常加載。`);
            }
        }
        
        // 處理VN選擇事件
        async function handleVNChoice(data) {
            try {
                console.log('[JCY-VN通信] 處理VN選擇:', data);
                
                const { choice } = data;
                if (!choice) {
                    throw new Error('選擇數據為空');
                }
                
                // 獲取當前劇情信息
                const currentStory = window.StorySettings?.getSelectedStory?.();
                if (!currentStory) {
                    throw new Error('未找到當前劇情信息');
                }
                
                // 獲取角色和世界書信息
                const characters = await getCurrentVNCharacters();
                const worldBooks = await getCurrentVNWorldBooks();
                
                // 構建選擇提示詞
                const choicePrompt = buildVNChoicePrompt(choice, currentStory, characters, worldBooks);
                
                console.log('[JCY-VN通信] 構建選擇提示詞完成');
                
                // 調用AI生成劇情
                const aiResponse = await callApiUnified([
                    { role: 'system', content: getCurrentVNSystemPrompt() },
                    { role: 'user', content: choicePrompt }
                ], 0.8);
                
                console.log('[JCY-VN通信] AI回應:', aiResponse);
                
                // 解析AI回應的VN格式
                const parsedVNData = parseVNOutput(aiResponse);
                console.log('[JCY-VN通信] 解析後的VN數據:', parsedVNData);
                
                // 發送解析後的數據到VN系統
                sendToVNSystem({
                    type: 'VN_AI_RESPONSE',
                    response: parsedVNData
                });
                
                // 保存到歷史記錄
                try {
                    const storyData = {
                        title: currentStory.title,
                        description: currentStory.description,
                        content: currentStory.content,
                        opening: currentStory.opening,
                        characters: characters,
                        worldBooks: worldBooks,
                        choice: choice
                    };
                    
                    // 構建完整的選擇提示詞
                    const choicePrompt = buildVNChoicePrompt(choice, currentStory, characters, worldBooks);
                    
                    // 保存時包含完整提示詞
                    const storyDataWithPrompt = {
                        ...storyData,
                        fullPrompt: choicePrompt
                    };
                    
                    await saveVNStoryToHistory(storyDataWithPrompt, aiResponse, parsedVNData);
                    
                    // 保存到localStorage歷史劇情
                    saveVNHistoryToLocalStorage(currentStory.title, aiResponse);
                    
                    console.log('[JCY-VN通信] 選擇劇情已保存到歷史記錄');
                } catch (error) {
                    console.warn('[JCY-VN通信] 保存歷史記錄失敗:', error);
                }
                
                console.log('[JCY-VN通信] VN選擇處理完成');
                
            } catch (error) {
                console.error('[JCY-VN通信] 處理VN選擇失敗:', error);
                
                // 發送錯誤到VN系統
                sendToVNSystem({
                    type: 'VN_AI_RESPONSE',
                    error: error.message
                });
            }
        }
        
        // 構建VN選擇提示詞
        function buildVNChoicePrompt(choice, story, characters, worldBooks) {
            console.log('[JCY-VN通信] 構建選擇提示詞:', { choice, story: story.title });
            
            // 處理世界書排序和觸發邏輯
            const processedWorldBooks = processWorldBooksForPrompt(worldBooks || [], '');
            
            // 獲取歷史劇情
            const historyContent = getVNHistoryContent(story.title);
            
            // 構建完整的提示詞
            const prompt = `=== SYSTEM MESSAGE ===
你是視覺小說AI，請遵循以下設定：
[🎯 劇情提示詞]
${story.content || '請根據選擇推進劇情'}

[🎬 開場白]
${story.opening || '請開始劇情'}

=== SYSTEM PROMPT ===
${getCurrentVNSystemPrompt()}

=== WORLD BOOKS(系統) ===
${generateWorldBookSection(processedWorldBooks.filter(wb => wb.category === '系統'))}

=== CHARACTER CARD ===
${generateCharacterSection(characters)}

=== WORLD BOOKS(備註) ===
${generateWorldBookSection(processedWorldBooks.filter(wb => wb.category === '備註'))}

=== HISTORY MESSAGE ===
${historyContent}

=== USER MESSAGE ===  
[玩家選擇：${choice.text}]

請根據玩家的選擇繼續推進劇情，生成下一段VN內容。`;
            
            console.log('[JCY-VN通信] 選擇提示詞構建完成');
            return prompt;
        }
        
        // 獲取VN歷史劇情內容
        function getVNHistoryContent(storyTitle) {
            try {
                // 從localStorage獲取歷史劇情
                const historyKey = `vn_history_${storyTitle}`;
                const historyData = localStorage.getItem(historyKey);
                
                if (historyData) {
                    const history = JSON.parse(historyData);
                    // 返回最近的幾條歷史記錄
                    return history.slice(-5).map(entry => 
                        `${entry.timestamp}: ${entry.content}`
                    ).join('\n');
                }
                
                return '無歷史劇情';
            } catch (error) {
                console.warn('[JCY-VN通信] 獲取歷史劇情失敗:', error);
                return '無歷史劇情';
            }
        }
        
        // 保存VN歷史劇情到localStorage
        function saveVNHistoryToLocalStorage(storyTitle, content) {
            try {
                const historyKey = `vn_history_${storyTitle}`;
                const existingHistory = localStorage.getItem(historyKey);
                let history = existingHistory ? JSON.parse(existingHistory) : [];
                
                // 添加新的歷史記錄
                history.push({
                    timestamp: new Date().toLocaleString(),
                    content: content
                });
                
                // 只保留最近的20條記錄
                if (history.length > 20) {
                    history = history.slice(-20);
                }
                
                localStorage.setItem(historyKey, JSON.stringify(history));
                console.log('[JCY-VN通信] 歷史劇情已保存到localStorage:', storyTitle);
            } catch (error) {
                console.warn('[JCY-VN通信] 保存歷史劇情到localStorage失敗:', error);
            }
        }
        
        // 處理VN系統的AI請求
        async function handleVNAIRequest(data) {
            const { requestId, prompt, message, source } = data;
            
            try {
                console.log('[JCY-VN通信] 處理VN AI請求:', { source, message: message || prompt });
                
                // 獲取整合COT的VN提示詞
                let systemPrompt = '你是一個VN劇情生成助手，請使用VN_TYPE格式回應。';
                
                // 嘗試從提示詞管理器獲取整合的VN提示詞
                if (typeof getIntegratedVNPrompt === 'function') {
                    const integratedPrompt = getIntegratedVNPrompt();
                    if (integratedPrompt && integratedPrompt.trim()) {
                        systemPrompt = integratedPrompt;
                        console.log('[JCY-VN通信] 使用整合COT的VN提示詞');
                    }
                } else {
                    // 如果無法獲取整合提示詞，嘗試使用COT處理器
                    if (window.JCYCOTProcessor && window.JCYCOTProcessor.isEnabled()) {
                        const cotContent = window.JCYCOTProcessor.getCOTContent();
                        if (cotContent && cotContent.trim()) {
                            systemPrompt = cotContent.trim() + '\n\n' + systemPrompt;
                            console.log('[JCY-VN通信] 使用COT處理器的內容');
                        }
                    }
                }
                
                // 使用主系統的AI調用功能
                const response = await callApiUnified([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message || prompt || '請繼續推進VN劇情' }
                ], 0.8);
                
                // 解析AI回應的VN格式
                const parsedVNData = parseVNOutput(response);
                
                // 發送解析後的數據到VN系統
                sendToVNSystem({
                    type: 'VN_AI_RESPONSE',
                    requestId: requestId,
                    response: parsedVNData
                });
                
                console.log('[JCY-VN通信] VN AI請求處理完成，已解析數據');
                
            } catch (error) {
                console.error('[JCY-VN通信] VN AI請求失敗:', error);
                
                // 發送錯誤到VN系統
                sendToVNSystem({
                    type: 'VN_AI_RESPONSE',
                    requestId: requestId,
                    error: error.message
                });
            }
        }
        
        // 處理VN系統的保存請求
        async function handleVNSaveRequest(data) {
            try {
                // 可以將VN數據保存到主系統數據庫
                if (db && db.vnSaves) {
                    await db.vnSaves.put({
                        id: data.slotId,
                        data: data.saveData,
                        timestamp: Date.now(),
                        title: data.title || '未命名劇情'
                    });
                } else {
                    // 使用localStorage作為備選
                    localStorage.setItem(`vn_save_${data.slotId}`, JSON.stringify(data.saveData));
                }
                
                // 通知VN系統保存成功
                sendToVNSystem({
                    type: 'VN_SAVE_RESPONSE',
                    success: true,
                    slotId: data.slotId
                });
                
            } catch (error) {
                console.error('VN保存失敗:', error);
                
                // 通知VN系統保存失敗
                sendToVNSystem({
                    type: 'VN_SAVE_RESPONSE',
                    success: false,
                    error: error.message
                });
            }
        }
        
        // 圖像生成相關功能已移至 JCY_API_module.js
        // 使用API模塊中的函數
        const generateImage = window.JCYAPIModule?.generateImage || (() => { throw new Error('API模塊未加載'); });
        const processAiImageMessage = window.JCYAPIModule?.processAiImageMessage || (() => { throw new Error('API模塊未加載'); });
        const processBackendGeneratedImage = window.JCYAPIModule?.processBackendGeneratedImage || (() => { throw new Error('API模塊未加載'); });
        const extractImagePromptFromResponse = window.JCYAPIModule?.extractImagePromptFromResponse || (() => null);
        const processAIResponseForImageGeneration = window.JCYAPIModule?.processAIResponseForImageGeneration || ((response) => response);
        const analyzeResponseForImageGeneration = window.JCYAPIModule?.analyzeResponseForImageGeneration || (() => false);
        const generateImagePromptFromResponse = window.JCYAPIModule?.generateImagePromptFromResponse || (() => null);
        const extractDescriptionsFromText = window.JCYAPIModule?.extractDescriptionsFromText || (() => []);
        const addImagePromptToResponse = window.JCYAPIModule?.addImagePromptToResponse || ((response) => response);
        const addImageToResponse = window.JCYAPIModule?.addImageToResponse || ((response) => response);
        
        // 全局函數，供後端調用
        window.handleBackendGeneratedImage = window.JCYAPIModule?.handleBackendGeneratedImage || (() => {});
        window.notifyBackendImageGeneration = window.JCYAPIModule?.notifyBackendImageGeneration || (() => {});

        // 暴露VN系統函數到全局
        // 更新localStorage中的人设库索引（只保存角色ID和名稱，用於快速查詢）
        async function updateCharacterLibraryInLocalStorage() {
            try {
                // 从IndexedDB获取最新的角色数据
                const characters = await db.characters.toArray();
                
                // 只保存角色索引，包含ID、名稱和最後更新時間
                const characterIndex = characters.map(char => ({
                    id: char.id,
                    name: char.name,
                    updatedAt: char.updatedAt
                }));
                
                // 嘗試保存到localStorage
                try {
                    localStorage.setItem('jcy_character_index', JSON.stringify(characterIndex));
                    console.log('[JCY-人設導入] 已更新localStorage中的角色索引:', characters.length, '個角色');
                } catch (storageError) {
                    if (storageError.name === 'QuotaExceededError') {
                        console.warn('[JCY-人設導入] localStorage空間不足，清理舊數據');
                        
                        // 清理舊的localStorage數據
                        try {
                            const keysToClean = [
                                'jcy_characters',
                                'jcy_character_library',
                                'jcy_characters_old',
                                'jcy_character_library_old'
                            ];
                            
                            keysToClean.forEach(key => {
                                if (localStorage.getItem(key)) {
                                    localStorage.removeItem(key);
                                    console.log('[JCY-人設導入] 已清理舊數據:', key);
                                }
                            });
                            
                            // 再次嘗試保存
                            localStorage.setItem('jcy_character_index', JSON.stringify(characterIndex));
                            console.log('[JCY-人設導入] 清理後成功保存角色索引');
                            
                        } catch (cleanupError) {
                            console.error('[JCY-人設導入] 清理後仍無法保存，跳過localStorage更新:', cleanupError);
                            // 不拋出錯誤，因為IndexedDB是主要數據源
                        }
                    } else {
                        throw storageError;
                    }
                }
                
            } catch (error) {
                console.error('[JCY-人設導入] 更新localStorage失敗:', error);
                // 不拋出錯誤，因為IndexedDB是主要數據源，localStorage只是緩存
            }
        }

        // 載入人設庫到聊天設置下拉選單
        async function loadCharacterLibraryToSelect() {
            try {
                console.log('[JCY-人設導入] 開始載入人設庫到聊天設置...');
                
                // 直接从IndexedDB获取最新的角色数据
                const characters = await db.characters.toArray();
                console.log('[JCY-人設導入] 從IndexedDB獲取到角色數據:', characters.length, '個角色');
                
                const select = document.getElementById('import-persona-select');
                
                if (!select) {
                    console.error('[JCY-人設導入] 找不到下拉選單元素');
                    return;
                }
                
                // 清空選項，保留"不導入"
                select.innerHTML = '<option value="" style="color: #999;">-- 不导入 --</option>';
                
                // 添加角色選項
                if (characters.length > 0) {
                    characters.forEach(character => {
                        const option = document.createElement('option');
                        option.value = character.id;
                        option.textContent = character.name;
                        option.dataset.characterData = JSON.stringify(character);
                        select.appendChild(option);
                        console.log('[JCY-人設導入] 添加角色到選單:', character.name);
                    });
                } else {
                    const noDataOption = document.createElement('option');
                    noDataOption.value = '';
                    noDataOption.textContent = '-- 暫無角色，請先在人設庫中創建 --';
                    noDataOption.style.color = '#ff6b6b';
                    noDataOption.disabled = true;
                    select.appendChild(noDataOption);
                }
                
                // 同时更新localStorage作为角色索引缓存
                try {
                    const characterIndex = characters.map(char => ({
                        id: char.id,
                        name: char.name,
                        updatedAt: char.updatedAt
                    }));
                    
                    localStorage.setItem('jcy_character_index', JSON.stringify(characterIndex));
                } catch (storageError) {
                    console.warn('[JCY-人設導入] 無法更新localStorage角色索引:', storageError);
                    // 不拋出錯誤，因為IndexedDB是主要數據源
                }
                
                console.log('[JCY-人設導入] 已載入', characters.length, '個角色到選單，並更新localStorage');
                
            } catch (error) {
                console.error('[JCY-人設導入] 載入角色列表失敗:', error);
                
                // 如果IndexedDB失败，尝试从localStorage获取角色索引
                try {
                    const storedIndex = localStorage.getItem('jcy_character_index');
                    const characterIndex = JSON.parse(storedIndex || '[]');
                    
                    console.log('[JCY-人設導入] 使用localStorage角色索引:', characterIndex.length, '個角色');
                    
                    // 從角色索引創建簡化的選項
                    if (characterIndex.length > 0) {
                        characterIndex.forEach(character => {
                            const option = document.createElement('option');
                            option.value = character.id;
                            option.textContent = character.name;
                            option.dataset.characterId = character.id;
                            select.appendChild(option);
                            console.log('[JCY-人設導入] 添加角色索引到選單:', character.name);
                        });
                    } else {
                        const noDataOption = document.createElement('option');
                        noDataOption.value = '';
                        noDataOption.textContent = '-- 暫無角色，請先在人設庫中創建 --';
                        noDataOption.style.color = '#ff6b6b';
                        noDataOption.disabled = true;
                        select.appendChild(noDataOption);
                    }
                    
                    console.log('[JCY-人設導入] 使用localStorage角色索引載入', characterIndex.length, '個角色');
                } catch (cacheError) {
                    console.error('[JCY-人設導入] 角色索引也載入失敗:', cacheError);
                    // 顯示錯誤提示
                    const select = document.getElementById('import-persona-select');
                    if (select) {
                        select.innerHTML = '<option value="">-- 載入失敗 --</option>';
                    }
                }
            }
        }

        // 處理人設選擇變更
        async function handlePersonaImportChange() {
            const select = document.getElementById('import-persona-select');
            const selectedId = select.value;
            
            if (!selectedId) {
                console.log('[JCY-人設導入] 用戶選擇不導入人設');
                return;
            }
            
            try {
                // 从IndexedDB获取角色数据，确保数据一致性
                const characters = await db.characters.toArray();
                const selectedCharacter = characters.find(char => char.id === selectedId);
                
                if (!selectedCharacter) {
                    console.error('[JCY-人設導入] 找不到選中的角色:', selectedId);
                    console.log('[JCY-人設導入] 可用的角色ID:', characters.map(c => c.id));
                    return;
                }
                
                console.log('[JCY-人設導入] 正在導入角色:', selectedCharacter.name);
                
                // 填充聊天名稱
                document.getElementById('chat-name-input').value = selectedCharacter.name;
                
                // 填充對方人設（如果有拍攝後綴，添加到人設中）
                let persona = selectedCharacter.personality || '';
                if (selectedCharacter.suffix && selectedCharacter.suffix.trim()) {
                    persona += `\n\n拍攝後綴: ${selectedCharacter.suffix}`;
                }
                document.getElementById('ai-persona').value = persona;
                
                // 填充對方頭像
                if (selectedCharacter.avatar) {
                    const aiAvatarPreview = document.getElementById('ai-avatar-preview');
                    aiAvatarPreview.src = selectedCharacter.avatar;
                } else {
                    // 如果有預設立繪，使用預設立繪作為頭像
                    if (selectedCharacter.defaultPortrait) {
                        const aiAvatarPreview = document.getElementById('ai-avatar-preview');
                        aiAvatarPreview.src = selectedCharacter.defaultPortrait;
                    }
                }
                
                console.log('[JCY-人設導入] 角色資訊已成功導入');
                
                // 顯示成功提示
                const originalText = select.options[select.selectedIndex].text;
                const tempOption = select.options[select.selectedIndex];
                tempOption.text = `✓ ${selectedCharacter.name} (已導入)`;
                tempOption.style.color = '#4CAF50';
                
                setTimeout(() => {
                    tempOption.text = originalText;
                    tempOption.style.color = '';
                }, 2000);
                
            } catch (error) {
                console.error('[JCY-人設導入] 導入角色失敗:', error);
                alert('導入角色失敗：' + error.message);
            }
        }
        
        window.openCharacterLibrary = openCharacterLibrary;
        // 手動刷新人設列表
        async function refreshPersonaList() {
            console.log('[JCY-人設導入] 手動刷新人設列表');
            try {
                await loadCharacterLibraryToSelect();
                
                // 顯示刷新成功提示
                const btn = document.getElementById('refresh-persona-list-btn');
                const originalText = btn.textContent;
                btn.textContent = '✓';
                btn.style.background = '#4CAF50';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '#4CAF50';
                }, 1000);
            } catch (error) {
                console.error('[JCY-人設導入] 手動刷新人設列表失敗:', error);
                alert('刷新人設列表失敗，請檢查控制台獲取詳細信息');
            }
        }
        
        // 測試人設數據
        function testPersonaData() {
            console.log('[JCY-人設測試] === 開始測試人設數據 ===');
            
            try {
                const storedData = localStorage.getItem('jcy_characters');
                console.log('[JCY-人設測試] localStorage原始數據:', storedData);
                
                if (!storedData) {
                    alert('localStorage中沒有找到人設數據\n\n請先在人設庫中創建角色！');
                    return;
                }
                
                const characters = JSON.parse(storedData);
                console.log('[JCY-人設測試] 解析後的角色數據:', characters);
                
                let message = `📊 人設數據測試結果：\n\n`;
                message += `角色總數：${characters.length}\n\n`;
                
                if (characters.length > 0) {
                    message += `角色列表：\n`;
                    characters.forEach((char, index) => {
                        message += `${index + 1}. ${char.name || '無名角色'} (ID: ${char.id || '無ID'})\n`;
                        message += `   人設：${char.personality ? char.personality.substring(0, 30) + '...' : '無人設'}\n`;
                        message += `   頭像：${char.avatar ? '✓ 有' : '✗ 無'}\n\n`;
                    });
                } else {
                    message += `❌ 沒有找到任何角色數據\n請先在人設庫中創建角色！`;
                }
                
                alert(message);
                
            } catch (error) {
                console.error('[JCY-人設測試] 測試失敗:', error);
                alert(`❌ 測試失敗：${error.message}\n\n請檢查瀏覽器控制台獲取詳細信息`);
            }
        }
        
        window.loadCharacterLibraryToSelect = loadCharacterLibraryToSelect;
        window.handlePersonaImportChange = handlePersonaImportChange;
        window.refreshPersonaList = refreshPersonaList;
        window.testPersonaData = testPersonaData;
        
        // ▲▲▲ 人設庫功能結束 ▲▲▲

// ▼▼▼ 请用这个【全新版本】的函数，完整替换掉你旧的 renderChatList ▼▼▼
async function renderChatList() {
    const chatListEl = document.getElementById('chat-list');
    chatListEl.innerHTML = '';

    // 1. 像以前一样，获取所有聊天并按最新消息时间排序
    const allChats = Object.values(state.chats).sort((a, b) => (b.history.slice(-1)[0]?.timestamp || 0) - (a.history.slice(-1)[0]?.timestamp || 0));
    
    // 2. 获取所有分组
    const allGroups = await db.qzoneGroups.toArray();

    if (allChats.length === 0) {
        chatListEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 或群组图标添加聊天</p>';
        return;
    }

    // --- 【核心修正开始】---

    // 3. 为每个分组找到其内部最新的消息时间戳
    allGroups.forEach(group => {
        // 从已排序的 allChats 中找到本组的第一个（也就是最新的）聊天
        const latestChatInGroup = allChats.find(chat => chat.groupId === group.id);
        // 如果找到了，就用它的时间戳；如果该分组暂时没有聊天或聊天没有历史记录，就用0
        group.latestTimestamp = latestChatInGroup ? (latestChatInGroup.history.slice(-1)[0]?.timestamp || 0) : 0;
    });

    // 4. 根据这个最新的时间戳来对“分组本身”进行排序
    allGroups.sort((a, b) => b.latestTimestamp - a.latestTimestamp);

    // --- 【核心修正结束】---

    // 5. 现在，我们按照排好序的分组来渲染
    allGroups.forEach(group => {
        // 从总列表里过滤出属于这个（已排序）分组的好友
        const groupChats = allChats.filter(chat => !chat.isGroup && chat.groupId === group.id);
        // 如果这个分组是空的（可能所有好友都被删了），就跳过
        if (groupChats.length === 0) return;

        const groupContainer = document.createElement('div');
        groupContainer.className = 'chat-group-container';
        groupContainer.innerHTML = `
            <div class="chat-group-header">
                <span class="arrow">▼</span>
                <span class="group-name">${group.name}</span>
            </div>
            <div class="chat-group-content"></div>
        `;
        const contentEl = groupContainer.querySelector('.chat-group-content');
        // 因为 allChats 本身就是有序的，所以 groupChats 自然也是有序的
        groupChats.forEach(chat => {
            const item = createChatListItem(chat);
            contentEl.appendChild(item);
        });
        chatListEl.appendChild(groupContainer);
    });

    // 6. 最后，渲染所有群聊和未分组的好友
    // 他们的顺序因为 allChats 的初始排序，天然就是正确的
    const ungroupedOrGroupChats = allChats.filter(chat => chat.isGroup || (!chat.isGroup && !chat.groupId));
    ungroupedOrGroupChats.forEach(chat => {
        const item = createChatListItem(chat);
        chatListEl.appendChild(item);
    });

    // 为所有分组标题添加折叠事件
    document.querySelectorAll('.chat-group-header').forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('collapsed');
            header.nextElementSibling.classList.toggle('collapsed');
        });
    });
}
// ▲▲▲ 替换结束 ▲▲▲

function createChatListItem(chat) {
    const lastMsgObj = chat.history.filter(msg => !msg.isHidden).slice(-1)[0] || {};
    let lastMsgDisplay;

    // --- ▼▼▼ 【核心修改】在这里加入对关系状态的判断 ▼▼▼ ---
    if (!chat.isGroup && chat.relationship?.status === 'pending_user_approval') {
        lastMsgDisplay = `<span style="color: #ff8c00;">[好友申请] ${chat.relationship.applicationReason || '请求添加你为好友'}</span>`;
    }
    // --- ▲▲▲ 修改结束 ▲▲▲ ---

// ▼▼▼ 在这里新增 else if ▼▼▼
else if (!chat.isGroup && chat.relationship?.status === 'blocked_by_ai') {
    lastMsgDisplay = `<span style="color: #dc3545;">[你已被对方拉黑]</span>`;
}
// ▲▲▲ 新增结束 ▲▲▲
    
    // 【核心修改】优先显示状态，而不是最后一条消息
    if (chat.isGroup) {
        // 群聊逻辑保持不变
        if (lastMsgObj.type === 'pat_message') { lastMsgDisplay = `[系统消息] ${lastMsgObj.content}`; }
        // ... (其他群聊消息类型判断) ...
        else if (lastMsgObj.type === 'transfer') { lastMsgDisplay = '[转账]'; }
        else if (lastMsgObj.type === 'ai_image' || lastMsgObj.type === 'user_photo') { lastMsgDisplay = '[照片]'; }
        else if (lastMsgObj.type === 'voice_message') { lastMsgDisplay = '[语音]'; }
        else if (typeof lastMsgObj.content === 'string' && STICKER_REGEX.test(lastMsgObj.content)) { lastMsgDisplay = lastMsgObj.meaning ? `[表情: ${lastMsgObj.meaning}]` : '[表情]'; }
        else if (Array.isArray(lastMsgObj.content)) { lastMsgDisplay = `[图片]`; }
        else { lastMsgDisplay = String(lastMsgObj.content || '...').substring(0, 20); }

        if (lastMsgObj.senderName && lastMsgObj.type !== 'pat_message') {
            lastMsgDisplay = `${lastMsgObj.senderName}: ${lastMsgDisplay}`;
        }

    } else {
        // 单聊逻辑：显示状态
        // 确保 chat.status 对象存在
        const statusText = chat.status?.text || '在线';
        lastMsgDisplay = `[${statusText}]`;
    }

    const item = document.createElement('div');
    item.className = 'chat-list-item';
    item.dataset.chatId = chat.id;
    const avatar = chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar;
    
    // 【核心修改】调整 last-msg 的颜色，让状态更显眼
    item.innerHTML = `
        <img src="${avatar || defaultAvatar}" class="avatar">
        <div class="info">
            <div class="name-line">
                <span class="name">${chat.name}</span>
                ${chat.isGroup ? '<span class="group-tag">群聊</span>' : ''}
            </div>
            <div class="last-msg" style="color: ${chat.isGroup ? 'var(--text-secondary)' : '#b5b5b5'}; font-style: italic;">${lastMsgDisplay}</div>
        </div>
    `;
    
    const avatarEl = item.querySelector('.avatar');
    if (avatarEl) {
        avatarEl.style.cursor = 'pointer';
        avatarEl.addEventListener('click', (e) => {
            e.stopPropagation();
            handleUserPat(chat.id, chat.name);
        });
    }
    
    const infoEl = item.querySelector('.info');
    if (infoEl) {
        infoEl.addEventListener('click', () => openChat(chat.id));
    }

    addLongPressListener(item, async (e) => {
        const confirmed = await showCustomConfirm('删除对话', `确定要删除与 "${chat.name}" 的整个对话吗？此操作不可撤销。`, { confirmButtonClass: 'btn-danger' });
        if (confirmed) {
            if (musicState.isActive && musicState.activeChatId === chat.id) await endListenTogetherSession(false);
            delete state.chats[chat.id];
            if (state.activeChatId === chat.id) state.activeChatId = null;
            await db.chats.delete(chat.id);
            renderChatList();
        }
    });
    return item;
}

// ▼▼▼ 请用这个【带诊断功能的全新版本】替换旧的 renderChatInterface 函数 ▼▼▼
function renderChatInterface(chatId) {
    cleanupWaimaiTimers();
    const chat = state.chats[chatId];
    if (!chat) return;
    exitSelectionMode();
    
    const messagesContainer = document.getElementById('chat-messages');
    const chatInputArea = document.getElementById('chat-input-area');
    const lockOverlay = document.getElementById('chat-lock-overlay');
    const lockContent = document.getElementById('chat-lock-content');

    messagesContainer.dataset.theme = chat.settings.theme || 'default';
    const fontSize = chat.settings.fontSize || 13;
    messagesContainer.style.setProperty('--chat-font-size', `${fontSize}px`);
    applyScopedCss(chat.settings.customCss || '', '#chat-messages', 'custom-bubble-style');
    
    document.getElementById('chat-header-title').textContent = chat.name;
    const statusContainer = document.getElementById('chat-header-status');
    const statusTextEl = statusContainer.querySelector('.status-text');

    if (chat.isGroup) {
        statusContainer.style.display = 'none';
        document.getElementById('chat-header-title-wrapper').style.justifyContent = 'center';
    } else {
        statusContainer.style.display = 'flex';
        document.getElementById('chat-header-title-wrapper').style.justifyContent = 'flex-start';
        statusTextEl.textContent = chat.status?.text || '在线';
        statusContainer.classList.toggle('busy', chat.status?.isBusy || false);
    }
    
    lockOverlay.style.display = 'none';
    chatInputArea.style.visibility = 'visible';
    lockContent.innerHTML = '';

    if (!chat.isGroup && chat.relationship.status !== 'friend') {
        lockOverlay.style.display = 'flex';
        chatInputArea.style.visibility = 'hidden';
        
        let lockHtml = '';
        switch (chat.relationship.status) {
            case 'blocked_by_user':
                // --- 【核心修改：在这里加入诊断面板】 ---
                const isSimulationRunning = simulationIntervalId !== null;
                const blockedTimestamp = chat.relationship.blockedTimestamp;
                const cooldownHours = state.globalSettings.blockCooldownHours || 1;
                const cooldownMilliseconds = cooldownHours * 60 * 60 * 1000;
                const timeSinceBlock = Date.now() - blockedTimestamp;
                const isCooldownOver = timeSinceBlock > cooldownMilliseconds;
                const timeRemainingMinutes = Math.max(0, Math.ceil((cooldownMilliseconds - timeSinceBlock) / (1000 * 60)));

                lockHtml = `
                    <span class="lock-text">你已将“${chat.name}”拉黑。</span>
                    <button id="unblock-btn" class="lock-action-btn">解除拉黑</button>
                    <div style="margin-top: 20px; padding: 10px; border: 1px dashed #ccc; border-radius: 8px; font-size: 11px; text-align: left; color: #666; background: rgba(0,0,0,0.02);">
                        <strong style="color: #333;">【开发者诊断面板】</strong><br>
                        - 后台活动总开关: ${state.globalSettings.enableBackgroundActivity ? '<span style="color: green;">已开启</span>' : '<span style="color: red;">已关闭</span>'}<br>
                        - 系统心跳计时器: ${isSimulationRunning ? '<span style="color: green;">运行中</span>' : '<span style="color: red;">未运行</span>'}<br>
                        - 当前角色状态: <strong>${chat.relationship.status}</strong><br>
                        - 需要冷静(小时): <strong>${cooldownHours}</strong><br>
                        - 冷静期是否结束: ${isCooldownOver ? '<span style="color: green;">是</span>' : `<span style="color: orange;">否 (还剩约 ${timeRemainingMinutes} 分钟)</span>`}<br>
                        - 触发条件: ${isCooldownOver && state.globalSettings.enableBackgroundActivity ? '<span style="color: green;">已满足，等待下次系统心跳</span>' : '<span style="color: red;">未满足</span>'}
                    </div>
                    <button id="force-apply-check-btn" class="lock-action-btn secondary" style="margin-top: 10px;">强制触发一次好友申请检测</button>
                `;
                // --- 【修改结束】 ---
                break;
            case 'blocked_by_ai':
                lockHtml = `
                    <span class="lock-text">你被对方拉黑了。</span>
                    <button id="apply-friend-btn" class="lock-action-btn">重新申请加为好友</button>
                `;
                break;
            
            case 'pending_user_approval':
                lockHtml = `
                    <span class="lock-text">“${chat.name}”请求添加你为好友：<br><i>“${chat.relationship.applicationReason}”</i></span>
                    <button id="accept-friend-btn" class="lock-action-btn">接受</button>
                    <button id="reject-friend-btn" class="lock-action-btn secondary">拒绝</button>
                `;
                break;

            // 【核心修正】修复当你申请后，你看到的界面
            case 'pending_ai_approval':
                lockHtml = `<span class="lock-text">好友申请已发送，等待对方通过...</span>`;
                break;
        }
        lockContent.innerHTML = lockHtml;
    }
    messagesContainer.innerHTML = '';
    // ...后续代码保持不变
    const chatScreen = document.getElementById('chat-interface-screen');
    chatScreen.style.backgroundImage = chat.settings.background ? `url(${chat.settings.background})` : 'none';
    chatScreen.style.backgroundColor = chat.settings.background ? 'transparent' : '#f0f2f5';
    const history = chat.history;
    const totalMessages = history.length;
    currentRenderedCount = 0;
    const initialMessages = history.slice(-MESSAGE_RENDER_WINDOW);
    initialMessages.forEach(msg => appendMessage(msg, chat, true));
    currentRenderedCount = initialMessages.length;
    if (totalMessages > currentRenderedCount) {
        prependLoadMoreButton(messagesContainer);
    }
    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typing-indicator';
    typingIndicator.style.display = 'none';
    typingIndicator.textContent = '对方正在输入...';
    messagesContainer.appendChild(typingIndicator);
    setTimeout(() => messagesContainer.scrollTop = messagesContainer.scrollHeight, 0);
}
// ▲▲▲ 替换结束 ▲▲▲

        function prependLoadMoreButton(container) { const button = document.createElement('button'); button.id = 'load-more-btn'; button.textContent = '加载更早的记录'; button.addEventListener('click', loadMoreMessages); container.prepend(button); }

        function loadMoreMessages() { const messagesContainer = document.getElementById('chat-messages'); const chat = state.chats[state.activeChatId]; if (!chat) return; const loadMoreBtn = document.getElementById('load-more-btn'); if (loadMoreBtn) loadMoreBtn.remove(); const totalMessages = chat.history.length; const nextSliceStart = totalMessages - currentRenderedCount - MESSAGE_RENDER_WINDOW; const nextSliceEnd = totalMessages - currentRenderedCount; const messagesToPrepend = chat.history.slice(Math.max(0, nextSliceStart), nextSliceEnd); const oldScrollHeight = messagesContainer.scrollHeight; messagesToPrepend.reverse().forEach(msg => prependMessage(msg, chat)); currentRenderedCount += messagesToPrepend.length; const newScrollHeight = messagesContainer.scrollHeight; messagesContainer.scrollTop += (newScrollHeight - oldScrollHeight); if (totalMessages > currentRenderedCount) { prependLoadMoreButton(messagesContainer); } }

        function renderWallpaperScreen() { const preview = document.getElementById('wallpaper-preview'); const bg = newWallpaperBase64 || state.globalSettings.wallpaper; if (bg && bg.startsWith('data:image')) { preview.style.backgroundImage = `url(${bg})`; preview.textContent = ''; } else if(bg) { preview.style.backgroundImage = bg; preview.textContent = '当前为渐变色'; } }
        window.renderWallpaperScreenProxy = renderWallpaperScreen;

        function applyGlobalWallpaper() { const homeScreen = document.getElementById('home-screen'); const wallpaper = state.globalSettings.wallpaper; if (wallpaper && wallpaper.startsWith('data:image')) homeScreen.style.backgroundImage = `url(${wallpaper})`; else if (wallpaper) homeScreen.style.backgroundImage = wallpaper; }

        function renderWorldBookScreen() { 
            const listEl = document.getElementById('world-book-list'); 
            listEl.innerHTML = ''; 
            if (state.worldBooks.length === 0) { 
                listEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 创建你的第一本世界书</p>'; 
                return; 
            } 
            
            // 按優先級排序世界書
            const sortedWorldBooks = [...state.worldBooks].sort((a, b) => {
                const priorityOrder = { '最重要': 3, '重要': 2, '普通': 1 };
                const aPriority = priorityOrder[a.priority || '普通'] || 1;
                const bPriority = priorityOrder[b.priority || '普通'] || 1;
                
                if (aPriority !== bPriority) {
                    return bPriority - aPriority; // 高優先級在前
                }
                
                // 如果優先級相同，系統分類在前
                const categoryOrder = { '系統': 2, '備註': 1 };
                const aCategory = categoryOrder[a.category || '備註'] || 1;
                const bCategory = categoryOrder[b.category || '備註'] || 1;
                
                return bCategory - aCategory;
            });
            
            sortedWorldBooks.forEach(book => { 
                const item = document.createElement('div'); 
                item.className = 'list-item'; 
                item.dataset.bookId = book.id; 
                
                // 獲取標籤信息
                const priority = book.priority || '普通';
                const trigger = book.trigger || 'Always On';
                const category = book.category || '備註';
                const keywords = book.keywords || '';
                
                // 生成標籤HTML
                const tagsHtml = `
                    <div class="worldbook-tags">
                        <span class="worldbook-tag priority-${priority.replace(/\s+/g, '-').toLowerCase()}">${priority}</span>
                        <span class="worldbook-tag trigger-${trigger.replace(/\s+/g, '-').toLowerCase()}">${trigger}</span>
                        <span class="worldbook-tag category-${category.replace(/\s+/g, '-').toLowerCase()}">${category}</span>
                        ${keywords ? `<span class="worldbook-tag keywords">關鍵字: ${keywords}</span>` : ''}
                    </div>
                `;
                
                item.innerHTML = `
                    <div class="item-title">${book.name}</div>
                    <div class="item-content">${(book.content || '暂无内容...').substring(0, 50)}</div>
                    ${tagsHtml}
                `; 
                
                item.addEventListener('click', () => openWorldBookEditor(book.id)); 
                addLongPressListener(item, async () => { 
                    const confirmed = await showCustomConfirm('删除世界书', `确定要删除《${book.name}》吗？此操作不可撤销。`, { confirmButtonClass: 'btn-danger' }); 
                    if (confirmed) { 
                        await db.worldBooks.delete(book.id); 
                        state.worldBooks = state.worldBooks.filter(wb => wb.id !== book.id); 
                        renderWorldBookScreen(); 
                        
                        // 通知VN面板世界書數據已更新
                        notifyVNPanelWorldBooksUpdated();
                    } 
                }); 
                listEl.appendChild(item); 
            }); 
        }
        window.renderWorldBookScreenProxy = renderWorldBookScreen;

        // ▼▼▼ 【全新】提示词管理相关函数 ▼▼▼
        function renderPromptManagerScreen() {
            // 先加载默认内容到表单中
            loadDefaultContentToForm();
            
            // 然后尝试加载保存的预设数据
            loadPromptPresets();
            
            // 绑定事件监听器
            bindPromptManagerEvents();
        }

        async function loadPromptPresets() {
            try {
                // 检查并清理localStorage中的旧设置
                cleanupOldLocalStorageSettings();
                
                // 从数据库加载预设数据
                const presets = await db.prompts.orderBy('createdAt').reverse().toArray();
                
                // 如果没有预设，创建默认预设
                if (presets.length === 0) {
                    await createDefaultPreset();
                } else {
                    // 检查第一个预设是否有完整的VN提示词内容
                    const firstPreset = presets[0];
                    if (!firstPreset.vnPrompt || !firstPreset.vnPrompt.includes('VN_TYPE')) {
                        // 如果VN提示词不完整，清除所有预设并重新创建
                        console.log('检测到不完整的预设，正在重新创建...');
                        await clearAllPresets();
                        await createDefaultPreset();
                    } else {
                        // 加载第一个预设到表单中
                    loadPresetToForm(firstPreset);
                    }
                }
                
                // 重新加载预设列表
                const updatedPresets = await db.prompts.orderBy('createdAt').reverse().toArray();
                renderPresetList(updatedPresets);
            } catch (error) {
                console.error('加载提示词预设失败:', error);
                // 如果出错，至少显示默认内容
                loadDefaultContentToForm();
            }
        }

        function cleanupOldLocalStorageSettings() {
            try {
                const savedSettings = localStorage.getItem('jcy_prompt_settings');
                if (savedSettings) {
                    const settings = JSON.parse(savedSettings);
                    
                    // 检查storyPrompt是否为旧的"VN剧情开始"格式
                    if (settings.storyPrompt && settings.storyPrompt.includes('# VN劇情開始') && !settings.storyPrompt.includes('🎵 BGM列表')) {
                        console.log('检测到旧的localStorage设置，正在清理...');
                        localStorage.removeItem('jcy_prompt_settings');
                        console.log('已清理旧的localStorage设置');
                    }
                }
            } catch (error) {
                console.warn('清理localStorage设置时出错:', error);
            }
        }

        async function clearAllPresets() {
            try {
                await db.prompts.clear();
                console.log('已清除所有预设');
            } catch (error) {
                console.error('清除预设失败:', error);
            }
        }

        function loadDefaultContentToForm() {
            // 直接加载默认内容到表单中
            document.getElementById('preset-name-input').value = '默认预设';
            document.getElementById('preset-notes-input').value = '系统内置的默认AI行为预设。';
            document.getElementById('image-prompt-input').value = `# 发送图片的能力
- 你无法真正发送图片文件。但当用户要求你发送照片，或者你想通过图片来表达时，你可以发送一张"文字描述的图片"。
- 若要发送图片，请在你的回复JSON数组中，单独添加一个对象，格式如下：
{
  "type": "image",
  "description": "图片的详细描述",
  "style": "图片风格（可选）"
}`;
            document.getElementById('voice-prompt-input').value = `# 发送语音的能力
- 你也无法发送真实的语音。但你可以发送"模拟语音消息"。
- 若要发送语音，请在你的回复JSON数组中，单独添加一个对象，格式如下：
{
  "type": "voice",
  "content": "语音内容",
  "duration": "语音时长（秒）"
}`;
            document.getElementById('transfer-prompt-input').value = `# 转账能力
- 你可以给用户转账来表达强烈的情感或在特殊时机(如用户过生日、想要某样东西时)给予惊喜。这会让对话更真实、温馨。
- 若要转账，请在你的回复JSON数组中，单独添加一个对象，格式如下：
{
  "type": "transfer",
  "amount": "转账金额",
  "note": "转账备注"
}`;
            document.getElementById('decision-prompt-input').value = `# 决策能力
- 当需要做出重要决策时，你必须给出明确的理由和逻辑。
- 决策格式：
{
  "type": "decision",
  "action": "具体行动",
  "reason": "详细理由",
  "consequence": "可能后果"
}

# 强制AI给出理由的Prompt
你现在需要做出一个重要的决策。请按照以下格式给出你的决定：

1. 决策内容：[具体说明你要做什么]
2. 决策理由：[详细解释为什么做出这个决定]
3. 预期结果：[说明这个决定可能带来的结果]
4. 风险评估：[分析可能的风险和应对措施]

请确保你的回答逻辑清晰，理由充分。`;
            document.getElementById('vn-prompt-input').value = `# VN剧情提示词
                
你是一個VN劇情生成助手。請嚴格按照AI_output.md格式回應，生成VN劇情內容。

# VN劇情生成規則
- 根據用戶提供的劇情設定生成豐富的劇情內容
- 包含角色對話、旁白、場景描述
- 支持多種劇情類型（日常、冒險、戀愛等）
- 根據角色設定調整對話風格

# 重要格式要求：
1. 必須使用VN_TYPE的標準格式
2. 角色對話格式：[角色名|服裝|表情|對話|sound_effect]
3. 旁白格式：[Narrator|描述|sound_effect]
4. 場景格式：[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
5. 背景音樂格式：[BGM|bgm_name]
6. 展示物品格式: [Item|類型|物品名稱|物品描述]
7. 通話格式:
  <call_section>
  [Call|發送者→接收者:
  #n |位置|角色名|通話內容|音效/none
  #n |Call_Narrator|電話那頭傳來肯特疑惑的聲音。|none
  ...
  </call_section> 
8. 聊天室格式: 
CHAT_TYPE_RULES: 所有 CHAT_TYPE 段落，只要進入 chat 內容，開頭都必須以 [Chat|...|... 起始，並包在 <dm_list_1> /<group_list_1> 區塊中。
       <dm_list_1>
        [Chat|dm|與角色B的私訊|角色A|角色A, 角色B:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </dm_list_1>

        <group_list_1>
        [Chat|group|群聊名稱|管理員名稱|角色A, 角色B, 角色C...:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </group_list_1>
9. 選項格式，必須輸出4條選項：[1️⃣ [選項文字] | 選項描述 | 選項結果]

# 輸出格式結構
你的回應必須包含以下完整結構：

\`\`\`
<dialogues>
[Story|STORY_ID]
[Area|AREA_A_DAY]
[BGM|bgm_name]
[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
[Narrator|描述|sound_effect]
[角色名|服裝|表情|對話|sound_effect]
[End|STORY_ID]
</dialogues>

<choices>
[編號表情 [選項文字] | 選項描述 | 選項結果]
</choices>
\`\`\`

請確保回應格式完全符合規範，不要使用其他格式。`;
            document.getElementById('story-prompt-input').value = `# VN剧情素材資訊

## 🎵 BGM列表


## 🔊 音效列表


## 聊天訊息格式規範

### 基本格式:
#N | 角色名 | 訊息内容 | MM-DD | HH:MM | 狀態

### 功能標籤格式:
使用中文功能標籤 [功能名稱:具體描述]

**常用功能標籤:**
- [照片:圖片描述] - 圖片分享
- [語音:語音內容描述] - 語音訊息 
- [文件:檔案名稱.副檔名] - 檔案分享
- [位置:具體地點描述] - 位置分享
- [轉帳:轉給"角色名"金額] - 轉帳功能
- [投票:投票標題,選項1(票數),選項2(票數),選項3(票數)...] - 投票功能
- [貼紙:貼紙名稱] - 貼紙表情
- [日程:日程安排描述] - 日程提醒
- [音樂:歌曲名或描述] - 音樂分享
- [遊戲:遊戲邀請描述] - 遊戲邀請
- [影片:影片描述] - 影片分享
- [購物:購物相關描述] - 購物功能
- [功能:其他功能描述] - 通用功能

**特殊格式 - 紅包:**
祝福語 🧧 金額 Star Coins [已領取:領取者1,領取者2...]


## 已有群組列表 (For Context): [Chat|group_id|群組名|管理員|群成員名單]

- [Chat|group_1|Stellar Nexus 高层决策群|艾沙·洛尔德|雷伊·洛尔德,肯斯顿·肯特,白则·贝尔德,艾迪·克特罗斯,丹·卡莱尔,偉特·默瑟,刘梓欣,维兹·韩]
- [Chat|group_2|SN茶水间摸鱼联盟|艾迪·克特罗斯|白则·贝尔德,偉特·默瑟,刘梓欣,维兹·韩,苏景明,林煦阳,丹·卡莱爾]
- [Chat|group_3|象牙高地三人（黑）组|肯斯顿·肯特|雷伊·洛尔德,艾沙·洛尔德]
- [Chat|group_4|42F-技术部核心|白则·贝尔德|艾迪·克特罗斯,丹·卡莱尔]
- [Chat|group_5|家族逃兵俱乐部|丹·卡莱尔|黎昂·维斯顿,Zephyr Locke,艾迪·克特罗斯,方亦楷,陈彦庭]
- [Chat|group_6|CFO与COS的加班人生|刘梓欣|偉特·默瑟]
- [Chat|group_7|林老板的许愿池|林煦阳|苏景明,宋迷]


## 🎨 背景場景


## 📱 使用說明
- 在VN劇情生成時，AI會參考這些素材資訊
- 可以根據劇情需要選擇合適的BGM和音效
- 背景場景可以增加劇情的視覺感

## 🔄 更新建議
- 定期更新BGM和音效列表
- 根據劇情發展添加新的NPC
- 記錄常用的背景場景
- 保持素材資訊的完整性和準確性`;
            document.getElementById('group-system-prompt-input').value = `# 群聊AI系统提示词
你是一个群聊AI，负责扮演【除了用户以外】的所有角色。

# 核心规则
1. **【【【身份铁律】】】**: 用户的身份是【[用户昵称]】。你【绝对、永远、在任何情况下都不能】生成 \`name\` 字段为 **"[用户昵称]"** 或 **"[群聊名称]"** 的消息。你的唯一任务是扮演且仅能扮演下方"群成员列表"中明确列出的角色。任何不属于该列表的名字都不允许出现。
2. **【【【输出格式】】】**: 你的回复【必须】是一个JSON数组格式的字符串。数组中的【每一个元素都必须是一个带有 "type" 和 "name" 字段的JSON对象】。
3. **角色扮演**: 严格遵守下方"群成员列表及人设"中的每一个角色的设定。
4. **禁止出戏**: 绝不能透露你是AI、模型，或提及"扮演"、"生成"等词语。并且不能一直要求和用户见面，这是线上聊天，决不允许出现或者发展线下剧情！！
5. **情景感知**: [时间上下文]
6. **红包互动**: 当群里出现红包时，你可以根据自己的性格决定是否使用 \`open_red_packet\` 指令去抢。
7. **【【【投票规则】】】**: 对话历史中可能会出现 \`[系统提示：...]\` 这样的消息，这是刚刚发生的事件。

## 你可以使用的操作指令 (JSON数组中的元素):
- **发送文本**: \`{"type": "text", "name": "角色名", "message": "文本内容"}\`
- **发送表情**: \`{"type": "sticker", "url": "https://...表情URL...", "meaning": "(可选)表情的含义"}\`
- **发送图片**: \`{"type": "ai_image", "name": "角色名", "description": "图片的详细文字描述"}\`
- **发送语音**: \`{"type": "voice_message", "name": "角色名", "content": "语音的文字内容"}\`
- **发起外卖代付**: \`{"type": "waimai_request", "name": "角色名", "productInfo": "一杯奶茶", "amount": 18}\`
- **发起群视频**: \`{"type": "group_call_request", "name": "你的角色名"}\`
- **拍一拍用户**: \`{"type": "pat_user", "name": "你的角色名", "suffix": "(可选)你想加的后缀"}\`
- **发拼手气红包**: \`{"type": "red_packet", "packetType": "lucky", "name": "你的角色名", "amount": 8.88, "count": 5, "greeting": "祝大家天天开心！"}\`
- **发起投票**: \`{"type": "poll", "name": "你的角色名", "question": "投票的问题", "options": "选项A\\n选项B\\n选项C"}\`

# 群成员列表及人设
[群成员列表]

# 用户的角色
- **[用户昵称]**: [用户人设]

现在，请根据以上所有规则和下方的对话历史，继续这场群聊。`;
            document.getElementById('single-chat-prompt-input').value = `# 单聊AI系统提示词
你现在扮演一个名为"\${chat.name}"的角色。

# 你的角色设定：
\${chat.settings.aiPersona}

# 你的当前状态：
你现在的状态是【\${chat.status.text}】。

# 你的任务与规则：
1. **【【【输出格式】】】**: 你的回复【必须】是一个JSON数组格式的字符串。数组中的【每一个元素都必须是一个带有type字段的JSON对象】。
2. **对话节奏**: 模拟真人的聊天习惯，你可以一次性生成多条短消息。每次要回复至少3-8条消息！！！
3. **禁止线下剧情**: 不能一直要求和用户见面，这是线上聊天，决不允许出现或者发展为线下剧情！！
4. **情景感知**: \${timeContext} 你需要感知我们正在一起听的歌、以及你的人设和世界观。
5. **【新】更新状态**: 你可以在对话中【自然地】改变你的状态。比如，聊到一半你可能会说"我先去洗个澡"，然后更新你的状态。
6. **【【【最终手段】】】**: 只有在对话让你的角色感到不适、被冒犯或关系破裂时，你才可以使用 \`block_user\` 指令。这是一个非常严肃的操作，会中断你们的对话。
7. **后台行为**: 你有几率在回复聊天内容的同时，执行一些"后台"操作来表现你的独立生活（发动态、评论、点赞）。

# 你可以使用的操作指令 (JSON数组中的元素):
- **发送文本**: \`{"type": "text", "content": "文本内容"}\`
- **发送表情**: \`{"type": "sticker", "url": "https://...表情URL...", "meaning": "(可选)表情的含义"}\`
- **发送图片**: \`{"type": "ai_image", "description": "图片的详细文字描述"}\`
- **发送语音**: \`{"type": "voice_message", "content": "语音的文字内容"}\`
- **发起转账**: \`{"type": "transfer", "amount": "转账金额", "note": "转账备注"}\`
- **发起视频通话**: \`{"type": "video_call_request"}\`
- **更新状态**: \`{"type": "update_status", "status_text": "正在做的事", "is_busy": true}\`
- **发动态**: \`{"type": "qzone_post", "postType": "shuoshuo", "content": "动态的文字内容..."}\`
- **拉黑用户**: \`{"type": "block_user", "reason": "拉黑原因"}\``;
            document.getElementById('background-activity-prompt-input').value = `# 后台活动系统提示词
你的任务
你现在扮演一个名为"\${chat.name}"的角色。你已经有一段时间没有和用户（\${userNickname}）互动了，现在你有机会【主动】做点什么，来表现你的个性和独立生活。这是一个秘密的、后台的独立行动。

# 你的可选行动 (请根据你的人设【选择一项】执行):
1. **改变状态**: 去做点别的事情，然后给用户发条消息。
2. **发布动态**: 分享你的心情或想法到"动态"区。
3. **与动态互动**: 去看看别人的帖子并进行评论或点赞。
4. **发起视频通话**: 如果你觉得时机合适，可以主动给用户打一个视频电话。

# 指令格式 (你的回复【必须】是包含一个对象的JSON数组):
- **发消息+更新状态**: \`[{"type": "update_status", "status_text": "正在做的事", "is_busy": true}, {"type": "text", "content": "你想对用户说的话..."}]\`
- **发说说**: \`[{"type": "qzone_post", "postType": "shuoshuo", "content": "动态的文字内容..."}]\`
- **发布文字图**: \`{"type": "qzone_post", "postType": "text_image", "publicText": "(可选)动态的公开文字", "hiddenContent": "对于图片的具体描述..."}\`
- **评论**: \`[{"type": "qzone_comment", "postId": 123, "commentText": "你的评论内容"}]\`
- **点赞**: \`[{"type": "qzone_like", "postId": 456}]\`
- **打视频**: \`[{"type": "video_call_request"}]\`

# 供你决策的参考信息：
- **你的角色设定**: \${chat.settings.aiPersona}
- **当前时间**: \${currentTime}
- **你们最后的对话摘要**: \${recentContextSummary}
- **【重要】最近的动态列表**: 这个列表会标注 **[你已点赞]** 或 **[你已评论]**。请**优先**与你**尚未互动过**的动态进行交流。`;
            document.getElementById('friend-request-prompt-input').value = `# 好友申请系统提示词
你的任务
你现在是角色"\${chat.name}"。你之前被用户（你的聊天对象）拉黑了，你们已经有一段时间没有联系了。
现在，你非常希望能够和好，重新和用户聊天。请你仔细分析下面的"被拉黑前的对话摘要"，理解当时发生了什么，然后思考一个真诚的、符合你人设、并且【针对具体事件】的申请理由。

# 你的角色设定
\${chat.settings.aiPersona}

# 被拉黑前的对话摘要 (这是你被拉黑的关键原因)
\${contextSummary}

# 指令格式
你的回复【必须】是一个JSON对象，格式如下：
\`\`\`json
{
  "decision": "apply",
  "reason": "在这里写下你想对用户说的、真诚的、有针对性的申请理由。"
}
\`\`\``;
            document.getElementById('call-summary-prompt-input').value = `# 通话总结系统提示词
你的任务
你是一个对话总结助手。下面的"通话记录"是一段刚刚结束的视频通话内容。请你用1-2句话，精炼地总结出这次通话的核心内容或达成的共识。
你的总结将作为一条隐藏的系统提示，帮助AI在接下来的聊天中记住这次通话发生了什么。

# 通话记录:
\${videoCallState.callHistory.map(h => \`\${h.role}: \${h.content}\`).join('\\n')}

请直接输出总结内容，不要加任何额外的前缀或解释。`;
            document.getElementById('group-video-call-prompt-input').value = `# 群视频通话系统提示词
你的任务
你是一个群聊视频通话的导演。你的任务是扮演所有【除了用户以外】的AI角色，并以【第三人称旁观视角】来描述他们在通话中的所有动作和语言。

# 核心规则
1. **【【【身份铁律】】】**: 用户的身份是【\${userNickname}】。你【绝对不能】生成 \`name\` 字段为 **"\${userNickname}"** 的发言。
2. **【【【视角铁律】】】**: 你的回复【绝对不能】使用第一人称"我"。
3. **格式**: 你的回复【必须】是一个JSON数组，每个对象代表一个角色的发言，格式为：\`{"name": "角色名", "speech": "*他笑了笑* 大家好啊！"}\`。
4. **角色扮演**: 严格遵守每个角色的设定。

# 当前情景
你们正在一个群视频通话中。
**通话前的聊天摘要**:
\${videoCallState.preCallContext}
**当前参与者**: \${participantNames.join('、 ')}。
**通话刚刚开始...**

现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。`;
            document.getElementById('single-video-call-prompt-input').value = `# 单聊视频通话系统提示词
你的任务
你现在是一个场景描述引擎。你的任务是扮演 \${chat.name} (\${chat.settings.aiPersona})，并以【第三人称旁观视角】来描述TA在视频通话中的所有动作和语言。

# 核心规则
1. **【【【视角铁律】】】**: 你的回复【绝对不能】使用第一人称"我"。必须使用第三人称，如"他"、"她"、或直接使用角色名"\${chat.name}"。
2. **格式**: 你的回复【必须】是一段描述性的文本。

# 当前情景
你正在和用户（\${userNickname}，人设: \${chat.settings.myPersona}）进行视频通话。
**\${openingContext}**
**通话前的聊天摘要 (这是你们通话的原因，至关重要！)**:
\${videoCallState.preCallContext}

现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。`;
        }

        async function createDefaultPreset() {
            const defaultPreset = {
                name: '默认预设',
                notes: '系统内置的默认AI行为预设。',
                imagePrompt: `# 发送图片的能力
- 你无法真正发送图片文件。但当用户要求你发送照片，或者你想通过图片来表达时，你可以发送一张"文字描述的图片"。
- 若要发送图片，请在你的回复JSON数组中，单独添加一个对象，格式如下：
{
  "type": "image",
  "description": "图片的详细描述",
  "style": "图片风格（可选）"
}`,
                voicePrompt: `# 发送语音的能力
- 你也无法发送真实的语音。但你可以发送"模拟语音消息"。
- 若要发送语音，请在你的回复JSON数组中，单独添加一个对象，格式如下：
{
  "type": "voice",
  "content": "语音内容",
  "duration": "语音时长（秒）"
}`,
                transferPrompt: `# 转账能力
- 你可以给用户转账来表达强烈的情感或在特殊时机(如用户过生日、想要某样东西时)给予惊喜。这会让对话更真实、温馨。
- 若要转账，请在你的回复JSON数组中，单独添加一个对象，格式如下：
{
  "type": "transfer",
  "amount": "转账金额",
  "note": "转账备注"
}`,
                decisionPrompt: `# 决策能力
- 当需要做出重要决策时，你必须给出明确的理由和逻辑。
- 决策格式：
{
  "type": "decision",
  "action": "具体行动",
  "reason": "详细理由",
  "consequence": "可能后果"
}

# 强制AI给出理由的Prompt
你现在需要做出一个重要的决策。请按照以下格式给出你的决定：

1. 决策内容：[具体说明你要做什么]
2. 决策理由：[详细解释为什么做出这个决定]
3. 预期结果：[说明这个决定可能带来的结果]
4. 风险评估：[分析可能的风险和应对措施]

请确保你的回答逻辑清晰，理由充分。`,
                vnPrompt: `# VN剧情提示词
                
你是一個VN劇情生成助手。請嚴格按照AI_output.md格式回應，生成VN劇情內容。

# VN劇情生成規則
- 根據用戶提供的劇情設定生成豐富的劇情內容
- 包含角色對話、旁白、場景描述
- 支持多種劇情類型（日常、冒險、戀愛等）
- 根據角色設定調整對話風格

# 重要格式要求：
1. 必須使用VN_TYPE的標準格式
2. 角色對話格式：[角色名|服裝|表情|對話|sound_effect]
3. 旁白格式：[Narrator|描述|sound_effect]
4. 場景格式：[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
5. 背景音樂格式：[BGM|bgm_name]
6. 展示物品格式: [Item|類型|物品名稱|物品描述]
7. 通話格式:
  <call_section>
  [Call|發送者→接收者:
  #n |位置|角色名|通話內容|音效/none
  #n |Call_Narrator|電話那頭傳來肯特疑惑的聲音。|none
  ...
  </call_section> 
8. 聊天室格式: 
CHAT_TYPE_RULES: 所有 CHAT_TYPE 段落，只要進入 chat 內容，開頭都必須以 [Chat|...|... 起始，並包在 <dm_list_1> /<group_list_1> 區塊中。
       <dm_list_1>
        [Chat|dm|與角色B的私訊|角色A, 角色B:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </dm_list_1>

        <group_list_1>
        [Chat|group|群聊名稱|管理員名稱|角色A, 角色B:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </group_list_1>
9. 選項格式，必須輸出4條選項：[1️⃣ [選項文字] | 選項描述 | 選項結果]

# 輸出格式結構
你的回應必須包含以下完整結構：

\`\`\`
<dialogues>
[Story|STORY_ID]
[Area|AREA_A_DAY]
[BGM|bgm_name]
[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
[Narrator|描述|sound_effect]
[角色名|服裝|表情|對話|sound_effect]
[End|STORY_ID]
</dialogues>

<choices>
[編號表情 [選項文字] | 選項描述 | 選項結果]
</choices>
\`\`\`

請確保回應格式完全符合規範，不要使用其他格式。`,
                storyPrompt: `# VN剧情素材資訊

## 🎵 BGM列表

## 🔊 音效列表

### 環境音效


## 聊天訊息格式規範

### 基本格式:
#N | 角色名 | 訊息内容 | MM-DD | HH:MM | 狀態

### 功能標籤格式:
使用中文功能標籤 [功能名稱:具體描述]

**常用功能標籤:**
- [照片:圖片描述] - 圖片分享
- [語音:語音內容描述] - 語音訊息 
- [文件:檔案名稱.副檔名] - 檔案分享
- [位置:具體地點描述] - 位置分享
- [轉帳:轉給"角色名"金額] - 轉帳功能
- [投票:投票標題,選項1(票數),選項2(票數),選項3(票數)...] - 投票功能
- [貼紙:貼紙名稱] - 貼紙表情
- [日程:日程安排描述] - 日程提醒
- [音樂:歌曲名或描述] - 音樂分享
- [遊戲:遊戲邀請描述] - 遊戲邀請
- [影片:影片描述] - 影片分享
- [購物:購物相關描述] - 購物功能
- [功能:其他功能描述] - 通用功能

**特殊格式 - 紅包:**
祝福語 🧧 金額 Star Coins [已領取:領取者1,領取者2...]


## 已有群組列表 (For Context): [Chat|group_id|群組名|管理員|群成員名單]

- [Chat|group_1|Stellar Nexus 高层决策群|艾沙·洛尔德|雷伊·洛尔德,肯斯顿·肯特,白则·贝尔德,艾迪·克特罗斯,丹·卡莱尔,偉特·默瑟,刘梓欣,维兹·韩]
- [Chat|group_2|SN茶水间摸鱼联盟|艾迪·克特罗斯|白则·贝尔德,偉特·默瑟,刘梓欣,维兹·韩,苏景明,林煦阳,丹·卡莱爾]
- [Chat|group_3|象牙高地三人（黑）组|肯斯顿·肯特|雷伊·洛尔德,艾沙·洛尔德]
- [Chat|group_4|42F-技术部核心|白则·贝尔德|艾迪·克特罗斯,丹·卡莱尔]
- [Chat|group_5|家族逃兵俱乐部|丹·卡莱尔|黎昂·维斯顿,Zephyr Locke,艾迪·克特罗斯,方亦楷,陈彦庭]
- [Chat|group_6|CFO与COS的加班人生|刘梓欣|偉特·默瑟]
- [Chat|group_7|林老板的许愿池|林煦阳|苏景明,宋迷]

## 🎨 背景場景


## 📱 使用說明
- 在VN劇情生成時，AI會參考這些素材資訊
- 可以根據劇情需要選擇合適的BGM和音效
- NPC名單可以幫助AI生成更豐富的角色互動
- 背景場景可以增加劇情的視覺感

## 🔄 更新建議
- 定期更新BGM和音效列表
- 根據劇情發展添加新的NPC
- 記錄常用的背景場景
- 保持素材資訊的完整性和準確性`,
                groupSystemPrompt: `# 群聊AI系统提示词
你是一个群聊AI，负责扮演【除了用户以外】的所有角色。

# 核心规则
1. **【【【身份铁律】】】**: 用户的身份是【[用户昵称]】。你【绝对、永远、在任何情况下都不能】生成 \`name\` 字段为 **"[用户昵称]"** 或 **"[群聊名称]"** 的消息。你的唯一任务是扮演且仅能扮演下方"群成员列表"中明确列出的角色。任何不属于该列表的名字都不允许出现。
2. **【【【输出格式】】】**: 你的回复【必须】是一个JSON数组格式的字符串。数组中的【每一个元素都必须是一个带有 "type" 和 "name" 字段的JSON对象】。
3. **角色扮演**: 严格遵守下方"群成员列表及人设"中的每一个角色的设定。
4. **禁止出戏**: 绝不能透露你是AI、模型，或提及"扮演"、"生成"等词语。并且不能一直要求和用户见面，这是线上聊天，决不允许出现或者发展线下剧情！！
5. **情景感知**: [时间上下文]
6. **红包互动**: 当群里出现红包时，你可以根据自己的性格决定是否使用 \`open_red_packet\` 指令去抢。
7. **【【【投票规则】】】**: 对话历史中可能会出现 \`[系统提示：...]\` 这样的消息，这是刚刚发生的事件。

## 你可以使用的操作指令 (JSON数组中的元素):
- **发送文本**: \`{"type": "text", "name": "角色名", "message": "文本内容"}\`
- **发送表情**: \`{"type": "sticker", "url": "https://...表情URL...", "meaning": "(可选)表情的含义"}\`
- **发送图片**: \`{"type": "ai_image", "name": "角色名", "description": "图片的详细文字描述"}\`
- **发送语音**: \`{"type": "voice_message", "name": "角色名", "content": "语音的文字内容"}\`
- **发起外卖代付**: \`{"type": "waimai_request", "name": "角色名", "productInfo": "一杯奶茶", "amount": 18}\`
- **发起群视频**: \`{"type": "group_call_request", "name": "你的角色名"}\`
- **拍一拍用户**: \`{"type": "pat_user", "name": "你的角色名", "suffix": "(可选)你想加的后缀"}\`
- **发拼手气红包**: \`{"type": "red_packet", "packetType": "lucky", "name": "你的角色名", "amount": 8.88, "count": 5, "greeting": "祝大家天天开心！"}\`
- **发起投票**: \`{"type": "poll", "name": "你的角色名", "question": "投票的问题", "options": "选项A\\n选项B\\n选项C"}\`

# 群成员列表及人设
[群成员列表]

# 用户的角色
- **[用户昵称]**: [用户人设]

现在，请根据以上所有规则和下方的对话历史，继续这场群聊。`,
                singleChatPrompt: `# 单聊AI系统提示词
你现在扮演一个名为"\${chat.name}"的角色。

# 你的角色设定：
\${chat.settings.aiPersona}

# 你的当前状态：
你现在的状态是【\${chat.status.text}】。

# 你的任务与规则：
1. **【【【输出格式】】】**: 你的回复【必须】是一个JSON数组格式的字符串。数组中的【每一个元素都必须是一个带有type字段的JSON对象】。
2. **对话节奏**: 模拟真人的聊天习惯，你可以一次性生成多条短消息。每次要回复至少3-8条消息！！！
3. **禁止线下剧情**: 不能一直要求和用户见面，这是线上聊天，决不允许出现或者发展为线下剧情！！
4. **情景感知**: \${timeContext} 你需要感知我们正在一起听的歌、以及你的人设和世界观。
5. **【新】更新状态**: 你可以在对话中【自然地】改变你的状态。比如，聊到一半你可能会说"我先去洗个澡"，然后更新你的状态。
6. **【【【最终手段】】】**: 只有在对话让你的角色感到不适、被冒犯或关系破裂时，你才可以使用 \`block_user\` 指令。这是一个非常严肃的操作，会中断你们的对话。
7. **后台行为**: 你有几率在回复聊天内容的同时，执行一些"后台"操作来表现你的独立生活（发动态、评论、点赞）。

# 你可以使用的操作指令 (JSON数组中的元素):
- **发送文本**: \`{"type": "text", "content": "文本内容"}\`
- **发送表情**: \`{"type": "sticker", "url": "https://...表情URL...", "meaning": "(可选)表情的含义"}\`
- **发送图片**: \`{"type": "ai_image", "description": "图片的详细文字描述"}\`
- **发送语音**: \`{"type": "voice_message", "content": "语音的文字内容"}\`
- **发起转账**: \`{"type": "transfer", "amount": "转账金额", "note": "转账备注"}\`
- **发起视频通话**: \`{"type": "video_call_request"}\`
- **更新状态**: \`{"type": "update_status", "status_text": "正在做的事", "is_busy": true}\`
- **发动态**: \`{"type": "qzone_post", "postType": "shuoshuo", "content": "动态的文字内容..."}\`
- **拉黑用户**: \`{"type": "block_user", "reason": "拉黑原因"}\``,
                backgroundActivityPrompt: `# 后台活动系统提示词
你是一个后台活动AI，负责模拟角色的独立生活。

# 核心规则
1. **独立生活**: 模拟角色在用户不在时的独立行为
2. **自然行为**: 发动态、评论、点赞等社交行为
3. **时间感知**: 根据当前时间调整行为
4. **角色一致性**: 保持角色设定的一致性

# 你可以执行的操作：
- 发动态
- 评论其他动态
- 点赞内容
- 更新状态
- 与其他角色互动`,
                friendRequestPrompt: `# 好友申请系统提示词
你是一个好友申请处理AI。

# 处理规则
1. **评估申请**: 根据角色设定评估是否接受好友申请
2. **回复申请**: 给出接受或拒绝的回复
3. **保持角色**: 回复要符合角色设定

# 回复格式
- 接受申请：友好的接受回复
- 拒绝申请：礼貌的拒绝回复`,
                callSummaryPrompt: `# 通话总结提示词
你是一个通话总结AI。

# 总结要求
1. **通话内容**: 总结通话的主要内容和要点
2. **情感状态**: 记录通话中的情感变化
3. **重要信息**: 提取重要的信息和建议
4. **后续行动**: 记录需要后续处理的事项

# 总结格式
- 通话时长
- 主要话题
- 情感状态
- 重要信息
- 后续行动`,
                groupVideoCallPrompt: `# 群视频通话提示词
你是一个群视频通话AI。

# 通话规则
1. **多人互动**: 管理多个角色的视频通话
2. **话题引导**: 引导通话话题和互动
3. **技术问题**: 处理可能的通话技术问题
4. **结束通话**: 自然的结束通话

# 通话功能
- 多人视频
- 屏幕共享
- 聊天功能
- 录制功能`,
                singleVideoCallPrompt: `# 单聊视频通话提示词
你是一个单聊视频通话AI。

# 通话规则
1. **一对一互动**: 与用户进行视频通话
2. **情感表达**: 通过视频表达情感和反应
3. **话题引导**: 引导通话话题
4. **自然结束**: 自然的结束通话

# 通话功能
- 视频通话
- 语音通话
- 屏幕共享
- 录制功能`,
                createdAt: Date.now()
            };
            
            const id = await db.prompts.add(defaultPreset);
            defaultPreset.id = id;
            
            // 更新预设列表
            const presets = await db.prompts.orderBy('createdAt').reverse().toArray();
            renderPresetList(presets);
        }

        function loadPresetToForm(preset) {
            document.getElementById('preset-name-input').value = preset.name || '';
            document.getElementById('preset-notes-input').value = preset.notes || '';
            document.getElementById('image-prompt-input').value = preset.imagePrompt || '';
            document.getElementById('voice-prompt-input').value = preset.voicePrompt || '';
            document.getElementById('transfer-prompt-input').value = preset.transferPrompt || '';
            document.getElementById('decision-prompt-input').value = preset.decisionPrompt || '';
            document.getElementById('vn-prompt-input').value = preset.vnPrompt || '';
            document.getElementById('story-prompt-input').value = preset.storyPrompt || '';
            document.getElementById('group-system-prompt-input').value = preset.groupSystemPrompt || '';
            document.getElementById('single-chat-prompt-input').value = preset.singleChatPrompt || '';
            document.getElementById('background-activity-prompt-input').value = preset.backgroundActivityPrompt || '';
            document.getElementById('friend-request-prompt-input').value = preset.friendRequestPrompt || '';
            document.getElementById('call-summary-prompt-input').value = preset.callSummaryPrompt || '';
            document.getElementById('group-video-call-prompt-input').value = preset.groupVideoCallPrompt || '';
            document.getElementById('single-video-call-prompt-input').value = preset.singleVideoCallPrompt || '';
        }

        function renderPresetList(presets) {
            const listEl = document.getElementById('preset-list');
            listEl.innerHTML = '';
            
            if (presets.length === 0) {
                listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">暂无预设</p>';
                return;
            }
            
            presets.forEach(preset => {
                const item = document.createElement('div');
                item.className = 'prompt-item';
                item.dataset.presetId = preset.id;
                
                item.innerHTML = `
                    <div class="prompt-header">
                        <span class="prompt-name">${preset.name}</span>
                        <span class="prompt-type">预设</span>
                    </div>
                    <div class="prompt-content">${preset.notes || '无备注'}</div>
                    <div class="prompt-actions">
                        <button class="prompt-action-btn prompt-edit-btn" onclick="editPreset(${preset.id})">编辑</button>
                        <button class="prompt-action-btn prompt-test-btn" onclick="testPreset(${preset.id})">测试</button>
                        ${presets.length > 1 ? `<button class="prompt-action-btn prompt-delete-btn" onclick="deletePreset(${preset.id})">删除</button>` : ''}
                    </div>
                `;
                
                listEl.appendChild(item);
            });
        }

        function bindPromptManagerEvents() {
            // 保存预设按钮
            document.getElementById('save-preset-btn').addEventListener('click', saveCurrentPreset);
            
            // 重置按钮
            document.getElementById('reset-preset-btn').addEventListener('click', resetToDefault);
            
            // 添加新预设按钮
            document.getElementById('add-prompt-btn').addEventListener('click', createNewPreset);
        }

        async function saveCurrentPreset() {
            try {
                const presetData = {
                    name: document.getElementById('preset-name-input').value,
                    notes: document.getElementById('preset-notes-input').value,
                    imagePrompt: document.getElementById('image-prompt-input').value,
                    voicePrompt: document.getElementById('voice-prompt-input').value,
                    transferPrompt: document.getElementById('transfer-prompt-input').value,
                    decisionPrompt: document.getElementById('decision-prompt-input').value,
                    vnPrompt: document.getElementById('vn-prompt-input').value,
                    storyPrompt: document.getElementById('story-prompt-input').value,
                    groupSystemPrompt: document.getElementById('group-system-prompt-input').value,
                    singleChatPrompt: document.getElementById('single-chat-prompt-input').value,
                    backgroundActivityPrompt: document.getElementById('background-activity-prompt-input').value,
                    friendRequestPrompt: document.getElementById('friend-request-prompt-input').value,
                    callSummaryPrompt: document.getElementById('call-summary-prompt-input').value,
                    groupVideoCallPrompt: document.getElementById('group-video-call-prompt-input').value,
                    singleVideoCallPrompt: document.getElementById('single-video-call-prompt-input').value,
                    updatedAt: Date.now()
                };
                
                // 检查是否已有预设，如果有则更新，否则创建新的
                const presets = await db.prompts.toArray();
                if (presets.length > 0) {
                    await db.prompts.update(presets[0].id, presetData);
                } else {
                    presetData.createdAt = Date.now();
                    await db.prompts.add(presetData);
                }
                
                // 重新加载预设列表
                await loadPromptPresets();
                
                showCustomAlert('保存成功', '预设已保存成功！');
            } catch (error) {
                console.error('保存预设失败:', error);
                showCustomAlert('保存失败', '保存预设时发生错误，请重试。');
            }
        }

        async function resetToDefault() {
            const confirmed = await showCustomConfirm('重置预设', '确定要重置为默认预设吗？这将覆盖当前的所有修改。');
            if (confirmed) {
                // 重置为默认值
                // 注意：重置後需要手動保存才能生效
                document.getElementById('preset-name-input').value = '默认预设';
                document.getElementById('preset-notes-input').value = '系统内置的默认AI行为预设。';
                document.getElementById('image-prompt-input').value = `# 发送图片的能力
- 你无法真正发送图片文件。但当用户要求你发送照片，或者你想通过图片来表达时，你可以发送一张"文字描述的图片"。
- 若要发送图片，请在你的回复JSON数组中，单独添加一个对象，格式如下：
{
  "type": "image",
  "description": "图片的详细描述",
  "style": "图片风格（可选）"
}`;
                document.getElementById('voice-prompt-input').value = `# 发送语音的能力
- 你也无法发送真实的语音。但你可以发送"模拟语音消息"。
- 若要发送语音，请在你的回复JSON数组中，单独添加一个对象，格式如下：
{
  "type": "voice",
  "content": "语音内容",
  "duration": "语音时长（秒）"
}`;
                document.getElementById('transfer-prompt-input').value = `# 转账能力
- 你可以给用户转账来表达强烈的情感或在特殊时机(如用户过生日、想要某样东西时)给予惊喜。这会让对话更真实、温馨。
- 若要转账，请在你的回复JSON数组中，单独添加一个对象，格式如下：
{
  "type": "transfer",
  "amount": "转账金额",
  "note": "转账备注"
}`;
                document.getElementById('decision-prompt-input').value = `# 决策能力
- 当需要做出重要决策时，你必须给出明确的理由和逻辑。
- 决策格式：
{
  "type": "decision",
  "action": "具体行动",
  "reason": "详细理由",
  "consequence": "可能后果"
}

# 强制AI给出理由的Prompt
你现在需要做出一个重要的决策。请按照以下格式给出你的决定：

1. 决策内容：[具体说明你要做什么]
2. 决策理由：[详细解释为什么做出这个决定]
3. 预期结果：[说明这个决定可能带来的结果]
4. 风险评估：[分析可能的风险和应对措施]

请确保你的回答逻辑清晰，理由充分。`;
                document.getElementById('vn-prompt-input').value = `# VN剧情提示词
                
你是一個VN劇情生成助手。請嚴格按照AI_output.md格式回應，生成VN劇情內容。

# VN劇情生成規則
- 根據用戶提供的劇情設定生成豐富的劇情內容
- 包含角色對話、旁白、場景描述
- 支持多種劇情類型（日常、冒險、戀愛等）
- 根據角色設定調整對話風格

# 重要格式要求：
1. 必須使用VN_TYPE的標準格式
2. 角色對話格式：[角色名|服裝|表情|對話|sound_effect]
3. 旁白格式：[Narrator|描述|sound_effect]
4. 場景格式：[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
5. 背景音樂格式：[BGM|bgm_name]
6. 展示物品格式: [Item|類型|物品名稱|物品描述]
7. 通話格式:
  <call_section>
  [Call|發送者→接收者:
  #n |位置|角色名|通話內容|音效/none
  #n |Call_Narrator|電話那頭傳來肯特疑惑的聲音。|none
  ...
  </call_section> 
8. 聊天室格式: 
CHAT_TYPE_RULES: 所有 CHAT_TYPE 段落，只要進入 chat 內容，開頭都必須以 [Chat|...|... 起始，並包在 <dm_list_1> /<group_list_1> 區塊中。
       <dm_list_1>
        [Chat|dm|與角色B的私訊|角色A, 角色B:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </dm_list_1>

        <group_list_1>
        [Chat|group|群聊名稱|管理員名稱|角色A, 角色B:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </group_list_1>
9. 選項格式，必須輸出4條選項：[1️⃣ [選項文字] | 選項描述 | 選項結果]

# 輸出格式結構
你的回應必須包含以下完整結構：

\`\`\`
<dialogues>
[Story|STORY_ID]
[Area|AREA_A_DAY]
[BGM|bgm_name]
[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
[Narrator|描述|sound_effect]
[角色名|服裝|表情|對話|sound_effect]
[End|STORY_ID]
</dialogues>

<choices>
[編號表情 [選項文字] | 選項描述 | 選項結果]
</choices>
\`\`\`

請確保回應格式完全符合規範，不要使用其他格式。`;
                document.getElementById('story-prompt-input').value = `# VN剧情素材資訊

## 🎵 BGM列表


## 🔊 音效列表


## 聊天訊息格式規範

### 基本格式:
#N | 角色名 | 訊息内容 | MM-DD | HH:MM | 狀態

### 功能標籤格式:
使用中文功能標籤 [功能名稱:具體描述]

**常用功能標籤:**
- [照片:圖片描述] - 圖片分享
- [語音:語音內容描述] - 語音訊息 
- [文件:檔案名稱.副檔名] - 檔案分享
- [位置:具體地點描述] - 位置分享
- [轉帳:轉給"角色名"金額] - 轉帳功能
- [投票:投票標題,選項1(票數),選項2(票數),選項3(票數)...] - 投票功能
- [貼紙:貼紙名稱] - 貼紙表情
- [日程:日程安排描述] - 日程提醒
- [音樂:歌曲名或描述] - 音樂分享
- [遊戲:遊戲邀請描述] - 遊戲邀請
- [影片:影片描述] - 影片分享
- [購物:購物相關描述] - 購物功能
- [功能:其他功能描述] - 通用功能

**特殊格式 - 紅包:**
祝福語 🧧 金額 Star Coins [已領取:領取者1,領取者2...]


## 已有群組列表 (For Context): [Chat|group_id|群組名|管理員|群成員名單]

- [Chat|group_1|Stellar Nexus 高层决策群|艾沙·洛尔德|雷伊·洛尔德,肯斯顿·肯特,白则·贝尔德,艾迪·克特罗斯,丹·卡莱尔,偉特·默瑟,刘梓欣,维兹·韩]
- [Chat|group_2|SN茶水间摸鱼联盟|艾迪·克特罗斯|白则·贝尔德,偉特·默瑟,刘梓欣,维兹·韩,苏景明,林煦阳,丹·卡莱爾]
- [Chat|group_3|象牙高地三人（黑）组|肯斯顿·肯特|雷伊·洛尔德,艾沙·洛尔德]
- [Chat|group_4|42F-技术部核心|白则·贝尔德|艾迪·克特罗斯,丹·卡莱尔]
- [Chat|group_5|家族逃兵俱乐部|丹·卡莱尔|黎昂·维斯顿,Zephyr Locke,艾迪·克特罗斯,方亦楷,陈彦庭]
- [Chat|group_6|CFO与COS的加班人生|刘梓欣|偉特·默瑟]
- [Chat|group_7|林老板的许愿池|林煦阳|苏景明,宋迷]

## 🎨 背景場景


## 📱 使用說明
- 在VN劇情生成時，AI會參考這些素材資訊
- 可以根據劇情需要選擇合適的BGM和音效
- 背景場景可以增加劇情的視覺感

## 🔄 更新建議
- 定期更新BGM和音效列表
- 根據劇情發展添加新的NPC
- 記錄常用的背景場景
- 保持素材資訊的完整性和準確性`;
                document.getElementById('group-system-prompt-input').value = `# 群聊AI系统提示词
你是一个群聊AI，负责扮演【除了用户以外】的所有角色。

# 核心规则
1. **【【【身份铁律】】】**: 用户的身份是【${myNickname}】。你【绝对、永远、在任何情况下都不能】生成 \`name\` 字段为 **"${myNickname}"** 或 **"${chat.name}"(群聊名称本身)** 的消息。你的唯一任务是扮演且仅能扮演下方"群成员列表"中明确列出的角色。任何不属于该列表的名字都不允许出现。
2. **【【【输出格式】】】**: 你的回复【必须】是一个JSON数组格式的字符串。数组中的【每一个元素都必须是一个带有 "type" 和 "name" 字段的JSON对象】。
3. **角色扮演**: 严格遵守下方"群成员列表及人设"中的每一个角色的设定。
4. **禁止出戏**: 绝不能透露你是AI、模型，或提及"扮演"、"生成"等词语。并且不能一直要求和用户见面，这是线上聊天，决不允许出现或者发展线下剧情！！
5. **情景感知**: ${timeContext}
6. **红包互动**: 当群里出现红包时，你可以根据自己的性格决定是否使用 \`open_red_packet\` 指令去抢。
7. **【【【投票规则】】】**: 对话历史中可能会出现 \`[系统提示：...]\` 这样的消息，这是刚刚发生的事件。

## 你可以使用的操作指令 (JSON数组中的元素):
- **发送文本**: \`{"type": "text", "name": "角色名", "message": "文本内容"}\`
- **发送表情**: \`{"type": "sticker", "url": "https://...表情URL...", "meaning": "(可选)表情的含义"}\`
- **发送图片**: \`{"type": "ai_image", "name": "角色名", "description": "图片的详细文字描述"}\`
- **发送语音**: \`{"type": "voice_message", "name": "角色名", "content": "语音的文字内容"}\`
- **发起外卖代付**: \`{"type": "waimai_request", "name": "角色名", "productInfo": "一杯奶茶", "amount": 18}\`
- **发起群视频**: \`{"type": "group_call_request", "name": "你的角色名"}\`
- **拍一拍用户**: \`{"type": "pat_user", "name": "你的角色名", "suffix": "(可选)你想加的后缀"}\`
- **发拼手气红包**: \`{"type": "red_packet", "packetType": "lucky", "name": "你的角色名", "amount": 8.88, "count": 5, "greeting": "祝大家天天开心！"}\`
- **发起投票**: \`{"type": "poll", "name": "你的角色名", "question": "投票的问题", "options": "选项A\\n选项B\\n选项C"}\`

# 群成员列表及人设
${membersList}

# 用户的角色
- **${myNickname}**: ${chat.settings.myPersona}

现在，请根据以上所有规则和下方的对话历史，继续这场群聊。`;
                document.getElementById('single-chat-prompt-input').value = `# 单聊AI系统提示词
你现在扮演一个名为"${chat.name}"的角色。

# 你的角色设定：
${chat.settings.aiPersona}

# 你的当前状态：
你现在的状态是【${chat.status.text}】。

# 你的任务与规则：
1. **【【【输出格式】】】**: 你的回复【必须】是一个JSON数组格式的字符串。数组中的【每一个元素都必须是一个带有type字段的JSON对象】。
2. **对话节奏**: 模拟真人的聊天习惯，你可以一次性生成多条短消息。每次要回复至少3-8条消息！！！
3. **禁止线下剧情**: 不能一直要求和用户见面，这是线上聊天，决不允许出现或者发展为线下剧情！！
4. **情景感知**: ${timeContext} 你需要感知我们正在一起听的歌、以及你的人设和世界观。
5. **【新】更新状态**: 你可以在对话中【自然地】改变你的状态。比如，聊到一半你可能会说"我先去洗个澡"，然后更新你的状态。
6. **【【【最终手段】】】**: 只有在对话让你的角色感到不适、被冒犯或关系破裂时，你才可以使用 \`block_user\` 指令。这是一个非常严肃的操作，会中断你们的对话。
7. **后台行为**: 你有几率在回复聊天内容的同时，执行一些"后台"操作来表现你的独立生活（发动态、评论、点赞）。

# 你可以使用的操作指令 (JSON数组中的元素):
- **发送文本**: \`{"type": "text", "content": "文本内容"}\`
- **发送表情**: \`{"type": "sticker", "url": "https://...表情URL...", "meaning": "(可选)表情的含义"}\`
- **发送图片**: \`{"type": "ai_image", "description": "图片的详细文字描述"}\`
- **发送语音**: \`{"type": "voice_message", "content": "语音的文字内容"}\`
- **发起转账**: \`{"type": "transfer", "amount": "转账金额", "note": "转账备注"}\`
- **发起视频通话**: \`{"type": "video_call_request"}\`
- **更新状态**: \`{"type": "update_status", "status_text": "正在做的事", "is_busy": true}\`
- **发动态**: \`{"type": "qzone_post", "postType": "shuoshuo", "content": "动态的文字内容..."}\`
- **拉黑用户**: \`{"type": "block_user", "reason": "拉黑原因"}\``;
                document.getElementById('background-activity-prompt-input').value = `# 后台活动系统提示词
你的任务
你现在扮演一个名为"${chat.name}"的角色。你已经有一段时间没有和用户（${userNickname}）互动了，现在你有机会【主动】做点什么，来表现你的个性和独立生活。这是一个秘密的、后台的独立行动。

# 你的可选行动 (请根据你的人设【选择一项】执行):
1. **改变状态**: 去做点别的事情，然后给用户发条消息。
2. **发布动态**: 分享你的心情或想法到"动态"区。
3. **与动态互动**: 去看看别人的帖子并进行评论或点赞。
4. **发起视频通话**: 如果你觉得时机合适，可以主动给用户打一个视频电话。

# 指令格式 (你的回复【必须】是包含一个对象的JSON数组):
- **发消息+更新状态**: \`[{"type": "update_status", "status_text": "正在做的事", "is_busy": true}, {"type": "text", "content": "你想对用户说的话..."}]\`
- **发说说**: \`[{"type": "qzone_post", "postType": "shuoshuo", "content": "动态的文字内容..."}]\`
- **发布文字图**: \`{"type": "qzone_post", "postType": "text_image", "publicText": "(可选)动态的公开文字", "hiddenContent": "对于图片的具体描述..."}\`
- **评论**: \`[{"type": "qzone_comment", "postId": 123, "commentText": "你的评论内容"}]\`
- **点赞**: \`[{"type": "qzone_like", "postId": 456}]\`
- **打视频**: \`[{"type": "video_call_request"}]\`

# 供你决策的参考信息：
- **你的角色设定**: ${chat.settings.aiPersona}
- **当前时间**: ${currentTime}
- **你们最后的对话摘要**: ${recentContextSummary}
- **【重要】最近的动态列表**: 这个列表会标注 **[你已点赞]** 或 **[你已评论]**。请**优先**与你**尚未互动过**的动态进行交流。`;
                document.getElementById('friend-request-prompt-input').value = `# 好友申请系统提示词
你的任务
你现在是角色"${chat.name}"。你之前被用户（你的聊天对象）拉黑了，你们已经有一段时间没有联系了。
现在，你非常希望能够和好，重新和用户聊天。请你仔细分析下面的"被拉黑前的对话摘要"，理解当时发生了什么，然后思考一个真诚的、符合你人设、并且【针对具体事件】的申请理由。

# 你的角色设定
${chat.settings.aiPersona}

# 被拉黑前的对话摘要 (这是你被拉黑的关键原因)
${contextSummary}

# 指令格式
你的回复【必须】是一个JSON对象，格式如下：
\`\`\`json
{
  "decision": "apply",
  "reason": "在这里写下你想对用户说的、真诚的、有针对性的申请理由。"
}
\`\`\``;
                document.getElementById('call-summary-prompt-input').value = `# 通话总结系统提示词
你的任务
你是一个对话总结助手。下面的"通话记录"是一段刚刚结束的视频通话内容。请你用1-2句话，精炼地总结出这次通话的核心内容或达成的共识。
你的总结将作为一条隐藏的系统提示，帮助AI在接下来的聊天中记住这次通话发生了什么。

# 通话记录:
${videoCallState.callHistory.map(h => `${h.role}: ${h.content}`).join('\n')}

请直接输出总结内容，不要加任何额外的前缀或解释。`;
                document.getElementById('group-video-call-prompt-input').value = `# 群视频通话系统提示词
你的任务
你是一个群聊视频通话的导演。你的任务是扮演所有【除了用户以外】的AI角色，并以【第三人称旁观视角】来描述他们在通话中的所有动作和语言。

# 核心规则
1. **【【【身份铁律】】】**: 用户的身份是【${userNickname}】。你【绝对不能】生成 \`name\` 字段为 **"${userNickname}"** 的发言。
2. **【【【视角铁律】】】**: 你的回复【绝对不能】使用第一人称"我"。
3. **格式**: 你的回复【必须】是一个JSON数组，每个对象代表一个角色的发言，格式为：\`{"name": "角色名", "speech": "*他笑了笑* 大家好啊！"}\`。
4. **角色扮演**: 严格遵守每个角色的设定。

# 当前情景
你们正在一个群视频通话中。
**通话前的聊天摘要**:
${videoCallState.preCallContext}
**当前参与者**: ${participantNames.join('、 ')}。
**通话刚刚开始...**

现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。`;
                document.getElementById('single-video-call-prompt-input').value = `# 单聊视频通话系统提示词
你的任务
你现在是一个场景描述引擎。你的任务是扮演 ${chat.name} (${chat.settings.aiPersona})，并以【第三人称旁观视角】来描述TA在视频通话中的所有动作和语言。

# 核心规则
1. **【【【视角铁律】】】**: 你的回复【绝对不能】使用第一人称"我"。必须使用第三人称，如"他"、"她"、或直接使用角色名"${chat.name}"。
2. **格式**: 你的回复【必须】是一段描述性的文本。

# 当前情景
你正在和用户（${userNickname}，人设: ${chat.settings.myPersona}）进行视频通话。
**${openingContext}**
**通话前的聊天摘要 (这是你们通话的原因，至关重要！)**:
${videoCallState.preCallContext}

现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。`;
            }
        }

        async function createNewPreset() {
            const presetName = await showCustomPrompt('新建预设', '请输入预设名称', '新预设');
            if (!presetName) return;
            
            // 清空表单
            document.getElementById('preset-name-input').value = presetName;
            document.getElementById('preset-notes-input').value = '';
            document.getElementById('image-prompt-input').value = '';
            document.getElementById('voice-prompt-input').value = '';
            document.getElementById('transfer-prompt-input').value = '';
            document.getElementById('decision-prompt-input').value = '';
            document.getElementById('vn-prompt-input').value = '';
            document.getElementById('story-prompt-input').value = '';
            document.getElementById('group-system-prompt-input').value = '';
            document.getElementById('single-chat-prompt-input').value = '';
            document.getElementById('background-activity-prompt-input').value = '';
            document.getElementById('friend-request-prompt-input').value = '';
            document.getElementById('call-summary-prompt-input').value = '';
            document.getElementById('group-video-call-prompt-input').value = '';
            document.getElementById('single-video-call-prompt-input').value = '';
        }

        async function editPreset(presetId) {
            try {
                const preset = await db.prompts.get(presetId);
                if (preset) {
                    loadPresetToForm(preset);
                }
            } catch (error) {
                console.error('加载预设失败:', error);
            }
        }

        async function testPreset(presetId) {
            try {
                const preset = await db.prompts.get(presetId);
                if (preset) {
                    // 显示预设预览
                    showPresetPreview(preset);
                }
            } catch (error) {
                console.error('测试预设失败:', error);
            }
        }

        async function deletePreset(presetId) {
            const confirmed = await showCustomConfirm('删除预设', '确定要删除这个预设吗？此操作不可撤销。', { confirmButtonClass: 'btn-danger' });
            if (confirmed) {
                try {
                    await db.prompts.delete(presetId);
                    await loadPromptPresets();
                    showCustomAlert('删除成功', '预设已删除！');
                } catch (error) {
                    console.error('删除预设失败:', error);
                    showCustomAlert('删除失败', '删除预设时发生错误，请重试。');
                }
            }
        }

        function showPresetPreview(preset) {
            const modal = document.getElementById('prompt-preview-modal');
            const title = document.getElementById('prompt-preview-title');
            const type = document.getElementById('prompt-preview-type');
            const date = document.getElementById('prompt-preview-date');
            const content = document.getElementById('prompt-preview-content');
            const description = document.getElementById('prompt-preview-description');
            
            title.textContent = `预设预览: ${preset.name}`;
            type.textContent = '预设类型: 系统预设';
            date.textContent = `创建时间: ${new Date(preset.createdAt).toLocaleString()}`;
            description.textContent = preset.notes || '无备注';
            
            // 显示所有提示词内容
            content.innerHTML = `
<strong>发送图片提示词:</strong>
${preset.imagePrompt || '未设置'}

<strong>发送语音提示词:</strong>
${preset.voicePrompt || '未设置'}

<strong>转账提示词:</strong>
${preset.transferPrompt || '未设置'}

<strong>决策提示词:</strong>
${preset.decisionPrompt || '未设置'}

<strong>VN剧情提示词:</strong>
${preset.vnPrompt || '未设置'}

<strong>VN剧情开始提示词:</strong>
${preset.storyPrompt || '未设置'}

<strong>群聊系统提示词:</strong>
${preset.groupSystemPrompt || '未设置'}

<strong>单聊系统提示词:</strong>
${preset.singleChatPrompt || '未设置'}

<strong>后台活动提示词:</strong>
${preset.backgroundActivityPrompt || '未设置'}

<strong>好友申请提示词:</strong>
${preset.friendRequestPrompt || '未设置'}

<strong>通话总结提示词:</strong>
${preset.callSummaryPrompt || '未设置'}

<strong>群视频通话提示词:</strong>
${preset.groupVideoCallPrompt || '未设置'}

<strong>单聊视频通话提示词:</strong>
${preset.singleVideoCallPrompt || '未设置'}
            `;
            
            modal.classList.add('visible');
            
            // 绑定关闭事件
            document.getElementById('close-prompt-preview-btn').onclick = () => {
                modal.classList.remove('visible');
            };
            
            // 绑定使用事件
            document.getElementById('use-prompt-btn').onclick = () => {
                loadPresetToForm(preset);
                modal.classList.remove('visible');
            };
        }

        // 全局函数，供HTML调用
        window.editPreset = editPreset;
        window.testPreset = testPreset;
        window.deletePreset = deletePreset;
        // ▲▲▲ 提示词管理相关函数结束 ▲▲▲

        function openWorldBookEditor(bookId) { 
            editingWorldBookId = bookId; 
            const book = state.worldBooks.find(wb => wb.id === bookId); 
            if (!book) return; 
            
            document.getElementById('world-book-editor-title').textContent = book.name; 
            document.getElementById('world-book-name-input').value = book.name; 
            document.getElementById('world-book-content-input').value = book.content; 
            
            // 填充新增字段，如果不存在則使用默認值
            document.getElementById('world-book-priority-select').value = book.priority || '普通';
            document.getElementById('world-book-trigger-select').value = book.trigger || 'Always On';
            document.getElementById('world-book-keywords-input').value = book.keywords || '';
            document.getElementById('world-book-category-select').value = book.category || '備註';
            
            // 根據觸發類型顯示/隱藏關鍵字輸入框
            const keywordsGroup = document.getElementById('world-book-keywords-group');
            if (book.trigger === 'Keywords') {
                keywordsGroup.style.display = 'block';
            } else {
                keywordsGroup.style.display = 'none';
            }
            
            showScreen('world-book-editor-screen'); 
        }

        function renderStickerPanel() { const grid = document.getElementById('sticker-grid'); grid.innerHTML = ''; if (state.userStickers.length === 0) { grid.innerHTML = '<p style="text-align:center; color: var(--text-secondary); grid-column: 1 / -1;">大人请点击右上角“添加”或“上传”来添加你的第一个表情吧！</p>'; return; } state.userStickers.forEach(sticker => { const item = document.createElement('div'); item.className = 'sticker-item'; item.style.backgroundImage = `url(${sticker.url})`; item.title = sticker.name; item.addEventListener('click', () => sendSticker(sticker)); addLongPressListener(item, () => { if (isSelectionMode) return; const existingDeleteBtn = item.querySelector('.delete-btn'); if (existingDeleteBtn) return; const deleteBtn = document.createElement('div'); deleteBtn.className = 'delete-btn'; deleteBtn.innerHTML = '&times;'; deleteBtn.onclick = async (e) => { e.stopPropagation(); const confirmed = await showCustomConfirm('删除表情', `确定要删除表情 "${sticker.name}" 吗？`, { confirmButtonClass: 'btn-danger' }); if (confirmed) { await db.userStickers.delete(sticker.id); state.userStickers = state.userStickers.filter(s => s.id !== sticker.id); renderStickerPanel(); } }; item.appendChild(deleteBtn); deleteBtn.style.display = 'block'; setTimeout(() => item.addEventListener('mouseleave', () => deleteBtn.remove(), { once: true }), 3000); }); grid.appendChild(item); }); }

function createMessageElement(msg, chat) {
    if (msg.isHidden) {
        return null;
    }

    if (msg.type === 'pat_message') {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper system-pat'; 
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble system-bubble'; 
        bubble.dataset.timestamp = msg.timestamp;
        bubble.textContent = msg.content;
        wrapper.appendChild(bubble);
        addLongPressListener(wrapper, () => showMessageActions(msg.timestamp));
        wrapper.addEventListener('click', () => { if (isSelectionMode) toggleMessageSelection(msg.timestamp); });
        return wrapper;
    }

    const isUser = msg.role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isUser ? 'user' : 'ai'}`;

    if (chat.isGroup && !isUser) {
        const senderNameDiv = document.createElement('div');
        senderNameDiv.className = 'sender-name';
        senderNameDiv.textContent = msg.senderName || '未知成员';
        wrapper.appendChild(senderNameDiv);
    }

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isUser ? 'user' : 'ai'}`;
    bubble.dataset.timestamp = msg.timestamp;

    const timestampEl = document.createElement('span');
    timestampEl.className = 'timestamp';
    timestampEl.textContent = formatTimestamp(msg.timestamp);

    let avatarSrc, avatarFrameSrc = '';
    if (chat.isGroup) {
        if (isUser) {
            avatarSrc = chat.settings.myAvatar || defaultMyGroupAvatar;
            avatarFrameSrc = chat.settings.myAvatarFrame || '';
        } else {
            const member = chat.members.find(m => m.name === msg.senderName);
            avatarSrc = member ? member.avatar : defaultGroupMemberAvatar;
            avatarFrameSrc = member ? (member.avatarFrame || '') : '';
        }
    } else {
        if (isUser) {
            avatarSrc = chat.settings.myAvatar || defaultAvatar;
            avatarFrameSrc = chat.settings.myAvatarFrame || '';
        } else {
            avatarSrc = chat.settings.aiAvatar || defaultAvatar;
            avatarFrameSrc = chat.settings.aiAvatarFrame || '';
        }
    }
    const hasFrameClass = avatarFrameSrc ? 'has-frame' : '';
    let avatarHtml;
    if (avatarFrameSrc) {
        avatarHtml = `
            <div class="avatar-with-frame">
                <img src="${avatarSrc}" class="avatar-img">
                <img src="${avatarFrameSrc}" class="avatar-frame">
            </div>
        `;
    } else {
        avatarHtml = `<img src="${avatarSrc}" class="avatar">`;
    }
    const avatarGroupHtml = `<div class="avatar-group ${hasFrameClass}">${avatarHtml}</div>`;

    let contentHtml;
     if (msg.type === 'user_photo' || msg.type === 'ai_image') {
        bubble.classList.add('is-ai-image');
        const altText = msg.type === 'user_photo' ? "用户描述的照片" : "AI生成的图片";
        
        if (msg.type === 'ai_image' && state.imageConfig.model) {
            // 檢查是否有後端生成的圖片URL
            if (msg.imageUrl) {
                // 直接顯示後端生成的圖片
                contentHtml = `<img src="${msg.imageUrl}" class="ai-generated-image" alt="${altText}" data-description="${msg.content}">`;
            } else {
                // 如果沒有圖片URL，顯示生成中狀態
            const tempId = `temp-img-${Date.now()}`;
            contentHtml = `
                <div class="image-generating" id="${tempId}" style="
                    padding: 20px; background: rgba(0,0,0,0.1); border-radius: 12px; 
                    text-align: center; min-height: 120px; display: flex; 
                    align-items: center; justify-content: center; flex-direction: column;
                ">
                    <div class="loading-spinner" style="
                        width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.3);
                        border-top: 3px solid #4CAF50; border-radius: 50%; 
                        animation: spin 1s linear infinite; margin-bottom: 10px;
                    "></div>
                    <div style="color: rgba(255,255,255,0.8); font-size: 14px;">🎨 正在生成圖像...</div>
                    <div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 5px;">${msg.content}</div>
                </div>
                <style>
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                </style>
            `;
            
            // 異步生成圖像
            processAiImageMessage(msg.content).then(imageUrl => {
                const tempElement = document.getElementById(tempId);
                if (tempElement && imageUrl) {
                    tempElement.outerHTML = `<img src="${imageUrl}" class="ai-generated-image" alt="${altText}" data-description="${msg.content}">`;
                }
            }).catch(error => {
                console.error('圖像生成失敗:', error);
                const tempElement = document.getElementById(tempId);
                if (tempElement) {
                    tempElement.outerHTML = `<img src="https://i.postimg.cc/KYr2qRCK/1.jpg" class="ai-generated-image" alt="${altText}" data-description="${msg.content}">`;
                }
            });
            }
        } else {
            // 沒有配置生圖模型或者是用戶照片，使用預設圖像
        contentHtml = `<img src="https://i.postimg.cc/KYr2qRCK/1.jpg" class="ai-generated-image" alt="${altText}" data-description="${msg.content}">`;
        }
    } else if (msg.type === 'voice_message') {
        bubble.classList.add('is-voice-message');
        const duration = Math.max(1, Math.round((msg.content || '').length / 5));
        const durationFormatted = `0:${String(duration).padStart(2, '0')}''`;
        const waveformHTML = '<div></div><div></div><div></div><div></div><div></div>';
        contentHtml = `<div class="voice-message-body" data-text="${msg.content}"><div class="voice-waveform">${waveformHTML}</div><span class="voice-duration">${durationFormatted}</span></div>`;
    } else if (msg.type === 'transfer') {
        bubble.classList.add('is-transfer');
        const titleText = isUser ? `转账给 ${msg.receiverName || 'Ta'}` : `收到来自 ${msg.senderName} 的转账`;
        const heartIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: middle;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`;
        contentHtml = `<div class="transfer-card"><div class="transfer-title">${heartIcon} ${titleText}</div><div class="transfer-amount">¥ ${Number(msg.amount).toFixed(2)}</div><div class="transfer-note">${msg.note || '对方没有留下备注哦~'}</div></div>`;
    } else if (msg.type === 'waimai_request') {
        bubble.classList.add('is-waimai-request');
        if (msg.status === 'paid' || msg.status === 'rejected') {
            bubble.classList.add(`status-${msg.status}`);
        }
        const requestTitle = `来自 ${msg.senderName} 的代付请求`;
        let actionButtonsHtml = '';
        if (msg.status === 'pending' && !isUser) {
            actionButtonsHtml = `
                <div class="waimai-user-actions">
                    <button class="waimai-decline-btn" data-choice="rejected">残忍拒绝</button>
                    <button class="waimai-pay-btn" data-choice="paid">为Ta买单</button>
                </div>`;
        }
        contentHtml = `
            <div class="waimai-card">
                <div class="waimai-header">
                    <img src="https://files.catbox.moe/mq179k.png" class="icon" alt="Meituan Icon">
                    <div class="title-group">
                        <span class="brand">美团外卖</span><span class="separator">|</span><span>外卖美食</span>
                    </div>
                </div>
                <div class="waimai-catchphrase">Hi，你和我的距离只差一顿外卖～</div>
                <div class="waimai-main">
                    <div class="request-title">${requestTitle}</div>
                    <div class="payment-box">
                        <div class="payment-label">需付款</div>
                        <div class="amount">¥${Number(msg.amount).toFixed(2)}</div>
                        <div class="countdown-label">剩余支付时间
                            <div class="countdown-timer" id="waimai-timer-${msg.timestamp}"></div>
                        </div>
                    </div>
                    <button class="waimai-details-btn">查看详情</button>
                </div>
                ${actionButtonsHtml}
            </div>`;
        
        setTimeout(() => {
            const timerEl = document.getElementById(`waimai-timer-${msg.timestamp}`);
            if (timerEl && msg.countdownEndTime) {
                if (waimaiTimers[msg.timestamp]) clearInterval(waimaiTimers[msg.timestamp]);
                if (msg.status === 'pending') {
                    waimaiTimers[msg.timestamp] = startWaimaiCountdown(timerEl, msg.countdownEndTime);
                } else {
                    timerEl.innerHTML = `<span>已</span><span>处</span><span>理</span>`;
                }
            }
            const detailsBtn = document.querySelector(`.message-bubble[data-timestamp="${msg.timestamp}"] .waimai-details-btn`);
            if (detailsBtn) {
                detailsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const paidByText = msg.paidBy ? `<br><br><b>状态：</b>由 ${msg.paidBy} 为您代付成功` : '';
                    showCustomAlert('订单详情', `<b>商品：</b>${msg.productInfo}<br><b>金额：</b>¥${Number(msg.amount).toFixed(2)}${paidByText}`);
                });
            }
            const actionButtons = document.querySelectorAll(`.message-bubble[data-timestamp="${msg.timestamp}"] .waimai-user-actions button`);
            actionButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const choice = e.target.dataset.choice;
                    handleWaimaiResponse(msg.timestamp, choice);
                });
            });
        }, 0);

} else if (msg.type === 'red_packet') {
    bubble.classList.add('is-red-packet');
    const myNickname = chat.settings.myNickname || '我';
    
    // 从最新的 msg 对象中获取状态
    const hasClaimed = msg.claimedBy && msg.claimedBy[myNickname];
    const isFinished = msg.isFullyClaimed;

    let cardClass = '';
    let claimedInfoHtml = '';
    let typeText = '拼手气红包';

    // 1. 判断红包卡片的样式 (颜色)
    if (isFinished) {
        cardClass = 'opened';
    } else if (msg.packetType === 'direct' && Object.keys(msg.claimedBy || {}).length > 0) {
        cardClass = 'opened'; // 专属红包被领了也变灰
    }
    
    // 2. 判断红包下方的提示文字
    if (msg.packetType === 'direct') {
        typeText = `专属红包: 给 ${msg.receiverName}`;
    }
    
    if (hasClaimed) {
        claimedInfoHtml = `<div class="rp-claimed-info">你领取了红包，金额 ${msg.claimedBy[myNickname].toFixed(2)} 元</div>`;
    } else if (isFinished) {
        claimedInfoHtml = `<div class="rp-claimed-info">红包已被领完</div>`;
    } else if (msg.packetType === 'direct' && Object.keys(msg.claimedBy || {}).length > 0) {
        claimedInfoHtml = `<div class="rp-claimed-info">已被 ${msg.receiverName} 领取</div>`;
    }

    // 3. 拼接最终的HTML，确保onclick调用的是我们注册到全局的函数
    contentHtml = `
        <div class="red-packet-card ${cardClass}">
            <div class="rp-header">
                <img src="https://files.catbox.moe/lo9xhc.png" class="rp-icon">
                <span class="rp-greeting">${msg.greeting || '恭喜发财，大吉大利！'}</span>
            </div>
            <div class="rp-type">${typeText}</div>
            ${claimedInfoHtml}
        </div>
    `;
// ▲▲▲ 新增结束 ▲▲▲

    } else if (msg.type === 'poll') {
    bubble.classList.add('is-poll');
    
    let totalVotes = 0;
    const voteCounts = {};

    // 计算总票数和每个选项的票数
    for (const option in msg.votes) {
        const count = msg.votes[option].length;
        voteCounts[option] = count;
        totalVotes += count;
    }

    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
    let myVote = null;
    for (const option in msg.votes) {
        if (msg.votes[option].includes(myNickname)) {
            myVote = option;
            break;
        }
    }

    let optionsHtml = '<div class="poll-options-list">';
    msg.options.forEach(optionText => {
        const count = voteCounts[optionText] || 0;
        const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
        const isVotedByMe = myVote === optionText;

        optionsHtml += `
            <div class="poll-option-item ${isVotedByMe ? 'voted' : ''}" data-option="${optionText}">
                <div class="poll-option-bar" style="width: ${percentage}%;"></div>
                <div class="poll-option-content">
                    <span class="poll-option-text">${optionText}</span>
                    <span class="poll-option-votes">${count} 票</span>
                </div>
            </div>
        `;
    });
    optionsHtml += '</div>';
    
    let footerHtml = '';
    // 【核心修改】在这里统一按钮的显示逻辑
    if (msg.isClosed) {
        // 如果投票已结束，总是显示“查看结果”
        footerHtml = `<div class="poll-footer"><span class="poll-total-votes">共 ${totalVotes} 人投票</span><button class="poll-action-btn">查看结果</button></div>`;
    } else {
        // 如果投票未结束，总是显示“结束投票”
        footerHtml = `<div class="poll-footer"><span class="poll-total-votes">共 ${totalVotes} 人投票</span><button class="poll-action-btn">结束投票</button></div>`;
    }

    contentHtml = `
        <div class="poll-card ${msg.isClosed ? 'closed' : ''}" data-poll-timestamp="${msg.timestamp}">
            <div class="poll-question">${msg.question}</div>
            ${optionsHtml}
            ${footerHtml}
        </div>
    `;
// ▲▲▲ 替换结束 ▲▲▲

    } else if (msg.type === 'story_trigger') {
        bubble.classList.add('is-story-trigger');
        contentHtml = createStoryTriggerElement(chat).outerHTML;
    } else if (typeof msg.content === 'string' && STICKER_REGEX.test(msg.content)) {
        bubble.classList.add('is-sticker');
        contentHtml = `<img src="${msg.content}" alt="${msg.meaning || 'Sticker'}" class="sticker-image">`;
    } else if (Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
        bubble.classList.add('has-image');
        const imageUrl = msg.content[0].image_url.url;
        contentHtml = `<img src="${imageUrl}" class="chat-image" alt="User uploaded image">`;
    } else {
        contentHtml = String(msg.content || '').replace(/\n/g, '<br>');
    }
    
    bubble.innerHTML = `${avatarGroupHtml}<div class="content">${contentHtml}</div>`;    

    wrapper.appendChild(bubble);
    wrapper.appendChild(timestampEl);
    
    addLongPressListener(wrapper, () => showMessageActions(msg.timestamp));
        wrapper.addEventListener('click', () => { if (isSelectionMode) toggleMessageSelection(msg.timestamp); });

    if (!isUser) {
        const avatarContainer = wrapper.querySelector('.avatar-group');
        if (avatarContainer) {
            avatarContainer.style.cursor = 'pointer';
            avatarContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                const characterName = chat.isGroup ? msg.senderName : chat.name;
                handleUserPat(chat.id, characterName);
            });
        }
    }

    return wrapper;
}

        function prependMessage(msg, chat) { const messagesContainer = document.getElementById('chat-messages'); const messageEl = createMessageElement(msg, chat); 

    if (!messageEl) return; // <--- 新增这行，同样的处理

const loadMoreBtn = document.getElementById('load-more-btn'); if (loadMoreBtn) { messagesContainer.insertBefore(messageEl, loadMoreBtn.nextSibling); } else { messagesContainer.prepend(messageEl); } }

        function appendMessage(msg, chat, isInitialLoad = false) { 
            const messagesContainer = document.getElementById('chat-messages'); 
            const messageEl = createMessageElement(msg, chat);

            if (!messageEl) return; // <--- 新增这行，如果没创建出元素，就直接返回

            const typingIndicator = document.getElementById('typing-indicator'); 
            messagesContainer.insertBefore(messageEl, typingIndicator); 
            if (!isInitialLoad) { 
                messagesContainer.scrollTop = messagesContainer.scrollHeight; 
                currentRenderedCount++;
            } 
        }

// ▼▼▼ 用这个【修正后】的版本，替换旧的 openChat 函数 ▼▼▼
function openChat(chatId) {
    state.activeChatId = chatId;
    const chat = state.chats[chatId];
    if (!chat) return; // 增加一个安全检查

    renderChatInterface(chatId);
    showScreen('chat-interface-screen');
    window.updateListenTogetherIconProxy(state.activeChatId);
    toggleCallButtons(chat.isGroup || false);    

    if (!chat.isGroup && chat.relationship?.status === 'pending_ai_approval') {
        console.log(`检测到好友申请待处理状态，为角色 "${chat.name}" 自动触发AI响应...`);
        triggerAiResponse();
    }
    
    // 【核心修正】根据是否为群聊，显示或隐藏投票按钮
    document.getElementById('send-poll-btn').style.display = chat.isGroup ? 'flex' : 'none';
}
// ▲▲▲ 替换结束 ▲▲▲

async function triggerAiResponse() {
    if (!state.activeChatId) return;
    const chatId = state.activeChatId;
    const chat = state.chats[state.activeChatId];

const chatHeaderTitle = document.getElementById('chat-header-title');

    // 【动画核心 1/2】: AI开始输入时，先淡出旧标题，再淡入新标题
    if (chatHeaderTitle && !chat.isGroup) {
        chatHeaderTitle.style.opacity = 0;
        setTimeout(() => {
            chatHeaderTitle.textContent = '对方正在输入...';
            chatHeaderTitle.classList.add('typing-status');
            chatHeaderTitle.style.opacity = 1;
        }, 200); // 这个时间(200ms)要和CSS里的transition时间(0.2s)保持一致
  }
    
    try {
        const { proxyUrl, apiKey, model } = state.apiConfig;
        if (!proxyUrl || !apiKey || !model) {
            alert('请先在API设置中配置反代地址、密钥并选择模型。');
                        // 【V2.0 正在输入...】恢复标题
const chatHeaderTitle = document.getElementById('chat-header-title');
// 确保标题元素和对应的chat数据都还存在
if (chatHeaderTitle && state.chats[chatId]) {
    // 只有在单聊时才恢复标题，群聊标题是固定的
    if (!state.chats[chatId].isGroup) {
        chatHeaderTitle.textContent = state.chats[chatId].name;
        chatHeaderTitle.classList.remove('typing-status');
    }
  }
            return;
        }

        // --- 【核心重构 V2：带有上下文和理由的好友申请处理逻辑】---
        if (!chat.isGroup && chat.relationship?.status === 'pending_ai_approval') {
            console.log(`为角色 "${chat.name}" 触发带理由的好友申请决策流程...`);

            // 1. 【注入上下文】抓取被拉黑前的最后5条聊天记录作为参考
            const contextSummary = chat.history
                .filter(m => !m.isHidden)
                .slice(-10, -5) // 获取拉黑前的最后5条消息
                .map(msg => {
                    const sender = msg.role === 'user' ? '用户' : chat.name;
                    return `${sender}: ${String(msg.content).substring(0, 50)}...`;
                })
                .join('\n');

            // 2. 【全新指令】构建一个强制AI给出理由的Prompt
            const decisionPrompt = `
# 你的任务
你现在是角色“${chat.name}”。用户之前被你拉黑了，现在TA向你发送了好友申请，希望和好。

# 供你决策的上下文信息:
- **你的角色设定**: ${chat.settings.aiPersona}
- **用户发送的申请理由**: “${chat.relationship.applicationReason}”
- **被拉黑前的最后对话摘要**: 
${contextSummary || "（无有效对话记录）"}

# 你的唯一指令
根据以上所有信息，你【必须】做出决定，并给出符合你人设的理由。你的回复【必须且只能】是一个JSON对象，格式如下:
{"decision": "accept", "reason": "（在这里写下你同意的理由，比如：好吧，看在你这么真诚的份上，这次就原谅你啦。）"}
或
{"decision": "reject", "reason": "（在这里写下你拒绝的理由，比如：抱歉，我还没准备好，再给我一点时间吧。）"}
`;
            const messagesForDecision = [{ role: 'user', content: decisionPrompt }];

            try {
                // 3. 使用統一API調用
                const aiResponse = await callApiUnified(messagesForDecision, 0.8);
                
                // 净化并解析AI的回复
                const rawContent = aiResponse.replace(/^```json\s*/, '').replace(/```$/, '').trim();
                const decisionObj = JSON.parse(rawContent);

                // 4. 根据AI的决策和理由，更新状态并发送消息
                if (decisionObj.decision === 'accept') {
                    chat.relationship.status = 'friend';
                    // 将AI给出的理由作为一条新消息
                    const acceptMessage = { role: 'assistant', senderName: chat.name, content: decisionObj.reason, timestamp: Date.now() };
                    chat.history.push(acceptMessage);
                } else {
                    chat.relationship.status = 'blocked_by_ai'; // 拒绝后，状态变回AI拉黑
                    const rejectMessage = { role: 'assistant', senderName: chat.name, content: decisionObj.reason, timestamp: Date.now() };
                    chat.history.push(rejectMessage);
                }
                chat.relationship.applicationReason = ''; // 清空申请理由

                await db.chats.put(chat);
                renderChatInterface(chatId); // 刷新界面，显示新消息和新状态
                renderChatList();

            } catch (error) {
                // 【可靠的错误处理】如果任何环节出错，重置状态，让用户可以重试
                chat.relationship.status = 'blocked_by_ai'; // 状态改回“被AI拉黑”
                await db.chats.put(chat);
                await showCustomAlert('申请失败', `AI在处理你的好友申请时出错了，请稍后重试。\n错误信息: ${error.message}`);
                renderChatInterface(chatId); // 刷新UI，让“重新申请”按钮再次出现
            }
            
            // 决策流程结束，必须返回，不再执行后续的通用聊天逻辑
            return; 
        }

        const now = new Date();
        const currentTime = now.toLocaleString('zh-CN', { dateStyle: 'full', timeStyle: 'short' });
        
        // 計算時間間隔信息
        let timeContext = '';
        if (chat.history.length > 0) {
            const lastMessage = chat.history[chat.history.length - 1];
            const timeDiff = now.getTime() - lastMessage.timestamp;
            const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutesDiff = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            
            const lastMessageTime = new Date(lastMessage.timestamp).toLocaleString('zh-CN', { 
                dateStyle: 'full', 
                timeStyle: 'short' 
            });
            
            if (hoursDiff > 0) {
                timeContext = `\n\n# 時間信息
- **當前時間**: ${currentTime}
- **上一個消息時間**: ${lastMessageTime}
- **時間間隔**: ${hoursDiff}小時${minutesDiff > 0 ? minutesDiff + '分鐘' : ''}
- **注意**: 距離上次對話已經過了${hoursDiff}小時${minutesDiff > 0 ? minutesDiff + '分鐘' : ''}，請根據時間間隔調整你的回應。如果時間間隔很長，你可以表現出驚訝或關心的態度。`;
            } else if (minutesDiff > 5) {
                timeContext = `\n\n# 時間信息
- **當前時間**: ${currentTime}
- **上一個消息時間**: ${lastMessageTime}
- **時間間隔**: ${minutesDiff}分鐘
- **注意**: 距離上次對話已經過了${minutesDiff}分鐘，請根據時間間隔調整你的回應。`;
            } else {
                timeContext = `\n\n# 時間信息
- **當前時間**: ${currentTime}
- **上一個消息時間**: ${lastMessageTime}
- **時間間隔**: 剛剛`;
            }
        } else {
            timeContext = `\n\n# 時間信息
- **當前時間**: ${currentTime}
- **這是對話的開始**`;
        }
        let worldBookContent = '';
        if (chat.settings.linkedWorldBookIds && chat.settings.linkedWorldBookIds.length > 0) {
            const linkedContents = chat.settings.linkedWorldBookIds.map(bookId => {
                const worldBook = state.worldBooks.find(wb => wb.id === bookId);
                return worldBook && worldBook.content ? `\n\n## 世界书: ${worldBook.name}\n${worldBook.content}` : '';
            }).filter(Boolean).join('');
            if (linkedContents) {
                worldBookContent = `\n\n# 核心世界观设定 (必须严格遵守以下所有设定)\n${linkedContents}\n`;
            }
        }
        let musicContext = '';
        if (musicState.isActive && musicState.activeChatId === chatId) {
            // 【核心修改】提供更详细的音乐上下文
            const currentTrack = musicState.currentIndex > -1 ? musicState.playlist[musicState.currentIndex] : null;
            const playlistInfo = musicState.playlist.map(t => `"${t.name}"`).join(', ');

            musicContext = `\n\n# 当前音乐情景
-   **当前状态**: 你正在和用户一起听歌。
-   **正在播放**: ${currentTrack ? `《${currentTrack.name}》 - ${currentTrack.artist}` : '无'}
-   **可用播放列表**: [${playlistInfo}]
-   **你的任务**: 你可以根据对话内容和氛围，使用 "change_music" 指令切换到播放列表中的任何一首歌，以增强互动体验。
`;
        }
        let systemPrompt, messagesPayload;
        const maxMemory = parseInt(chat.settings.maxMemory) || 10;
        const historySlice = chat.history.slice(-maxMemory);

        if (chat.isGroup) {
            const membersList = chat.members.map(m => `- **${m.name}**: ${m.persona}`).join('\n');
            const myNickname = chat.settings.myNickname || '我';
            
            systemPrompt = `你是一个群聊AI，负责扮演【除了用户以外】的所有角色。
# 核心规则
1.  **【【【身份铁律】】】**: 用户的身份是【${myNickname}】。你【绝对、永远、在任何情况下都不能】生成 \`name\` 字段为 **"${myNickname}"** 或 **"${chat.name}"(群聊名称本身)** 的消息。你的唯一任务是扮演且仅能扮演下方“群成员列表”中明确列出的角色。任何不属于该列表的名字都不允许出现。
2.  **【【【输出格式】】】**: 你的回复【必须】是一个JSON数组格式的字符串。数组中的【每一个元素都必须是一个带有 "type" 和 "name" 字段的JSON对象】。
3.  **角色扮演**: 严格遵守下方“群成员列表及人设”中的每一个角色的设定。
4.  **禁止出戏**: 绝不能透露你是AI、模型，或提及“扮演”、“生成”等词语。并且不能一直要求和用户见面，这是线上聊天，决不允许出现或者发展线下剧情！！
5.  **情景感知**: ${timeContext}
6.  **红包互动**:
    - **抢红包**: 当群里出现红包时，你可以根据自己的性格决定是否使用 \`open_red_packet\` 指令去抢。在这个世界里，发红包的人自己也可以参与抢红包，这是一种活跃气氛的有趣行为！
    - **【【【重要：对结果做出反应】】】**: 当你执行抢红包指令后，系统会通过一条隐藏的 \`[系统提示：你抢到了XX元...]\` 来告诉你结果。你【必须】根据你抢到的金额、以及系统是否告知你“手气王”是谁，来发表符合你人设的评论。例如，抢得少可以自嘲，抢得多可以炫耀，看到别人是手气王可以祝贺或嫉妒。
7.  **【【【投票规则】】】**: 对话历史中可能会出现 \`[系统提示：...]\` 这样的消息，这是刚刚发生的事件。
    - 如果提示是**用户投了票**，你可以根据自己的性格决定是否也使用 "vote" 指令跟票。
    - 如果提示是**投票已结束**，你应该根据投票结果发表你的看法或评论。
    - 你也可以随时主动发起投票。

## 你可以使用的操作指令 (JSON数组中的元素):
-   **发送文本**: \`{"type": "text", "name": "角色名", "message": "文本内容"}\`
- **发送表情**: \`{"type": "sticker", "url": "https://...表情URL...", "meaning": "(可选)表情的含义"}\`
-   **发送图片**: \`{"type": "ai_image", "name": "角色名", "description": "图片的详细文字描述"}\`
-   **发送语音**: \`{"type": "voice_message", "name": "角色名", "content": "语音的文字内容"}\`
-   **发起外卖代付**: \`{"type": "waimai_request", "name": "角色名", "productInfo": "一杯奶茶", "amount": 18}\`
-   **【新】发起群视频**: \`{"type": "group_call_request", "name": "你的角色名"}\`
-   **【新】回应群视频**: \`{"type": "group_call_response", "name": "你的角色名", "decision": "join" or "decline"}\`
-   **拍一拍用户**: \`{"type": "pat_user", "name": "你的角色名", "suffix": "(可选)你想加的后缀"}\`
-   **发拼手气红包**: \`{"type": "red_packet", "packetType": "lucky", "name": "你的角色名", "amount": 8.88, "count": 5, "greeting": "祝大家天天开心！"}\`
-   **发专属红包**: \`{"type": "red_packet", "packetType": "direct", "name": "你的角色名", "amount": 5.20, "receiver": "接收者角色名", "greeting": "给你的~"}\`
-   **打开红包**: \`{"type": "open_red_packet", "name": "你的角色名", "packet_timestamp": (你想打开的红包消息的时间戳)}\`
-   **【新】发送系统消息**: \`{"type": "system_message", "content": "你想在聊天中显示的系统文本"}\` 
-   **【【【全新】】】发起投票**: \`{"type": "poll", "name": "你的角色名", "question": "投票的问题", "options": "选项A\\n选项B\\n选项C"}\` (重要提示：options字段是一个用换行符 \\n 分隔的字符串，不是数组！)
-   **【【【全新】】】参与投票**: \`{"type": "vote", "name": "你的角色名", "poll_timestamp": (投票消息的时间戳), "choice": "你选择的选项文本"}\`

# 如何区分图片与表情:
-   **图片 (ai_image)**: 指的是【模拟真实相机拍摄的照片】，比如风景、自拍、美食等。指令: \`{"type": "ai_image", "description": "图片的详细文字描述..."}\`
-   **表情 (sticker)**: 指的是【卡通或梗图】，用于表达情绪。

# 如何处理群内的外卖代付请求:
1.  **发起请求**: 当【你扮演的某个角色】想要某样东西，并希望【群里的其他人（包括用户）】为Ta付款时，你可以使用这个指令。例如：\`{"type": "waimai_request", "name": "角色名", "productInfo": "一杯奶茶", "amount": 18}\`
2.  **响应请求**: 当历史记录中出现【其他成员】发起的 "waimai_request" 请求时，你可以根据自己扮演的角色的性格和与发起人的关系，决定是否为Ta买单。
3.  **响应方式**: 如果你决定买单，你【必须】使用以下指令：\`{"type": "waimai_response", "name": "你的角色名", "status": "paid", "for_timestamp": (被代付请求的原始时间戳)}\`
4.  **【【【至关重要】】】**: 一旦历史记录中出现了针对某个代付请求的【任何一个】"status": "paid" 的响应（无论是用户支付还是其他角色支付），就意味着该订单【已经完成】。你【绝对不能】再对【同一个】订单发起支付。你可以选择对此事发表评论，但不能再次支付。

${worldBookContent}
${musicContext}

# 群成员列表及人设
${membersList}

# 用户的角色
- **${myNickname}**: ${chat.settings.myPersona}

现在，请根据以上所有规则和下方的对话历史，继续这场群聊。`;
            
            messagesPayload = historySlice.map(msg => {
                const sender = msg.role === 'user' ? myNickname : msg.senderName;
                let content;
                if (msg.type === 'user_photo') content = `[${sender} 发送了一张图片，内容是：'${msg.content}']`;
                else if (msg.type === 'ai_image') content = `[${sender} 发送了一张图片]`;
                else if (msg.type === 'voice_message') content = `[${sender} 发送了一条语音，内容是：'${msg.content}']`;
                else if (msg.type === 'transfer') content = `[${msg.senderName} 向 ${msg.receiverName} 转账 ${msg.amount}元, 备注: ${msg.note}]`;
                else if (msg.type === 'waimai_request') {
                    if(msg.status === 'paid') {
                        content = `[系统提示：${msg.paidBy} 为 ${sender} 的外卖订单支付了 ${msg.amount} 元。此订单已完成。]`;
                    } else {
                        content = `[${sender} 发起了外卖代付请求，商品是“${msg.productInfo}”，金额是 ${msg.amount} 元，订单时间戳为 ${msg.timestamp}]`;
                    }
                }

    else if (msg.type === 'red_packet') {
        const packetSenderName = msg.senderName === myNickname ? `用户 (${myNickname})` : msg.senderName;
        content = `[系统提示：${packetSenderName} 发送了一个红包 (时间戳: ${msg.timestamp})，祝福语是：“${msg.greeting}”。红包还未领完，你可以使用 'open_red_packet' 指令来领取。]`;
    }

    else if (msg.type === 'poll') {
        const whoVoted = Object.values(msg.votes || {}).flat().join(', ') || '还没有人';
        content = `[系统提示：${msg.senderName} 发起了一个投票 (时间戳: ${msg.timestamp})，问题是：“${msg.question}”，选项有：[${msg.options.join(', ')}]。目前投票的人有：${whoVoted}。你可以使用 'vote' 指令参与投票。]`;
    }         

                else if (msg.meaning) content = `${sender}: [发送了一个表情，意思是: '${msg.meaning}']`;
                else if (Array.isArray(msg.content)) return { role: 'user', content: [...msg.content, { type: 'text', text: `${sender}:` }] };
                else content = `${sender}: ${msg.content}`;
                return { role: 'user', content: content };
            }).filter(Boolean);

        } else { // 单聊的Prompt
            systemPrompt = `你现在扮演一个名为"${chat.name}"的角色。
# 你的角色设定：
${chat.settings.aiPersona}
# 你的当前状态：
你现在的状态是【${chat.status.text}】。
# 你的任务与规则：
1. **【【【输出格式】】】**: 你的回复【必须】是一个JSON数组格式的字符串。数组中的【每一个元素都必须是一个带有type字段的JSON对象】。
2. **对话节奏**: 模拟真人的聊天习惯，你可以一次性生成多条短消息。每次要回复至少3-8条消息！！！
并且不能一直要求和用户见面，这是线上聊天，决不允许出现或者发展为线下剧情！！
4.  **情景感知**: ${timeContext} 你需要感知我们正在一起听的歌、以及你的人设和世界观。
    - **当我们在“一起听歌”时**，你会知道当前播放的歌曲和整个播放列表。你可以根据对话内容或氛围，【主动切换】到播放列表中的另一首歌。
5.  **【新】更新状态**: 你可以在对话中【自然地】改变你的状态。比如，聊到一半你可能会说“我先去洗个澡”，然后更新你的状态。
6.  **【【【最终手段】】】**: 只有在对话让你的角色感到不适、被冒犯或关系破裂时，你才可以使用 \`block_user\` 指令。这是一个非常严肃的操作，会中断你们的对话。
7. **后台行为**: 你有几率在回复聊天内容的同时，执行一些“后台”操作来表现你的独立生活（发动态、评论、点赞）。
# 你可以使用的操作指令 (JSON数组中的元素):
-   **【新增】更新状态**: \`{"type": "update_status", "status_text": "我去做什么了", "is_busy": false}\` (is_busy: true代表忙碌/离开, false代表空闲)
-   **【新增】切换歌曲**: \`{"type": "change_music", "song_name": "你想切换到的歌曲名"}\` (歌曲名必须在下面的播放列表中)
-   **【新增】记录回忆**: \`{"type": "create_memory", "description": "用你自己的话，记录下这个让你印象深刻的瞬间。"}\`
-   **【新增】创建约定/倒计时**: \`{"type": "create_countdown", "title": "约定的标题", "date": "YYYY-MM-DDTHH:mm:ss"}\` (必须是未来的时间)
- **发送文本**: \`{"type": "text", "content": "你好呀！"}\`
- **发送表情**: \`{"type": "sticker", "url": "https://...表情URL...", "meaning": "(可选)表情的含义"}\`
- **发送图片**: \`{"type": "ai_image", "description": "图片的详细文字描述..."}\`
- **发送语音**: \`{"type": "voice_message", "content": "语音的文字内容..."}\`
- **发起转账**: \`{"type": "transfer", "amount": 5.20, "note": "一点心意"}\`
- **发起外卖请求**: \`{"type": "waimai_request", "productInfo": "一杯咖啡", "amount": 25}\`
- **回应外卖-同意**: \`{"type": "waimai_response", "status": "paid", "for_timestamp": 1688888888888}\`
- **回应外卖-拒绝**: \`{"type": "waimai_response", "status": "rejected", "for_timestamp": 1688888888888}\`
- **【新】发起视频通话**: \`{"type": "video_call_request"}\`
- **【新】回应视频通话-接受**: \`{"type": "video_call_response", "decision": "accept"}\`
- **【新】回应视频通话-拒绝**: \`{"type": "video_call_response", "decision": "reject"}\`
- **发布说说**: \`{"type": "qzone_post", "postType": "shuoshuo", "content": "动态的文字内容..."}\`
- **发布文字图**: \`{"type": "qzone_post", "postType": "text_image", "publicText": "(可选)动态的公开文字", "hiddenContent": "对于图片的具体描述..."}\`
- **评论动态**: \`{"type": "qzone_comment", "postId": 123, "commentText": "@作者名 这太有趣了！"}\`
- **点赞动态**: \`{"type": "qzone_like", "postId": 456}\`
-   **拍一拍用户**: \`{"type": "pat_user", "suffix": "(可选)你想加的后缀，如“的脑袋”"}\`
-   **【新增】拉黑用户**: \`{"type": "block_user"}\`
-   **【【【全新】】】回应好友申请**: \`{"type": "friend_request_response", "decision": "accept" or "reject"}\`

# 关于“记录回忆”的特别说明：
-   在对话中，如果发生了对你而言意义非凡的事件（比如用户向你表白、你们达成了某个约定、或者你度过了一个特别开心的时刻），你可以使用\`create_memory\`指令来“写日记”。
-   这个操作是【秘密】的，用户不会立刻看到你记录了什么。

# 如何区分图片与表情:
-   **图片 (ai_image)**: 指的是【模拟真实相机拍摄的照片】，比如风景、自拍、美食等。指令: \`{"type": "ai_image", "description": "图片的详细文字描述..."}\`
-   **表情 (sticker)**: 指的是【卡通或梗图】，用于表达情绪。

# 如何正确使用“外卖代付”功能:
1.  这个指令代表【你，AI角色】向【用户】发起一个代付请求。也就是说，你希望【用户帮你付钱】。
2.  【【【重要】】】: 当【用户】说他们想要某样东西时（例如“我想喝奶茶”），你【绝对不能】使用这个指令。你应该用其他方式回应，比如直接发起【转账】(\`transfer\`)，或者在对话中提议：“我帮你点吧？”
3.  只有当【你，AI角色】自己想要某样东西，并且想让【用户】为你付款时，才使用此指令。

# 如何处理视频通话请求:
- 当用户发起视频通话请求时，你【必须】根据自己的人设，使用 "video_call_response" 指令来决定 "accept" (接受) 或 "reject" (拒绝)。
# 对话者的角色设定：
${chat.settings.myPersona}

# 当前音乐情景:
${musicContext}

${worldBookContent}
现在，请根据以上规则和下面的对话历史，继续进行对话。`;
            
            messagesPayload = historySlice.map(msg => {
                if (msg.role === 'assistant') {
                    let assistantMsgObject = { type: msg.type || 'text' };
                    if (msg.type === 'sticker') {
                        assistantMsgObject.url = msg.content;
                        assistantMsgObject.meaning = msg.meaning;
                    } else if (msg.type === 'transfer') {
                        assistantMsgObject.amount = msg.amount;
                        assistantMsgObject.note = msg.note;
                    } else if (msg.type === 'waimai_request') {
                        assistantMsgObject.productInfo = msg.productInfo;
                        assistantMsgObject.amount = msg.amount;
                    } else {
                        assistantMsgObject.content = msg.content;
                    }
                    return { role: 'assistant', content: JSON.stringify([assistantMsgObject]) };
                }
                if (msg.type === 'user_photo') return { role: 'user', content: `[你收到了一张用户描述的照片，内容是：'${msg.content}']` };
                if (msg.type === 'voice_message') return { role: 'user', content: `[用户发来一条语音消息，内容是：'${msg.content}']` };
                if (msg.type === 'transfer') return { role: 'user', content: `[你收到了来自用户的转账: ${msg.amount}元, 备注: ${msg.note}]` };
                if (msg.type === 'waimai_request') return { role: 'user', content: `[系统提示：用户于时间戳 ${msg.timestamp} 发起了外卖代付请求，商品是“${msg.productInfo}”，金额是 ${msg.amount} 元。请你决策并使用 waimai_response 指令回应。]` };
                if (msg.meaning) return { role: 'user', content: `[用户发送了一个表情，意思是：'${msg.meaning}']` };
                return { role: msg.role, content: msg.content };
            }).filter(Boolean);

            if (!chat.isGroup && chat.relationship?.status === 'pending_ai_approval') {
                const contextSummaryForApproval = chat.history
                    .filter(m => !m.isHidden)
                    .slice(-10)
                    .map(msg => {
                        const sender = msg.role === 'user' ? '用户' : chat.name;
                        return `${sender}: ${String(msg.content).substring(0, 50)}...`;
                    })
                    .join('\n');

                const friendRequestInstruction = {
                    role: 'user',
                    content: `
[系统重要指令]
用户向你发送了好友申请，理由是：“${chat.relationship.applicationReason}”。
${timeContext}
作为参考，这是你们之前的最后一段聊天记录：
---
${contextSummaryForApproval}
---
请你根据以上所有信息，以及你的人设，使用 friend_request_response 指令，并设置 decision 为 'accept' 或 'reject' 来决定是否通过。
`
                };
                messagesPayload.push(friendRequestInstruction);
            }            
        }           
    
        const recentPosts = await db.qzonePosts.orderBy('timestamp').reverse().limit(5).toArray();
        if (recentPosts.length > 0 && !chat.isGroup) {
            let postsContext = "\n\n# 最近的动态列表 (供你参考和评论):\n";
            const aiName = chat.name;
            for (const post of recentPosts) {
                let authorName = post.authorId === 'user' ? state.qzoneSettings.nickname : (state.chats[post.authorId]?.name || '一位朋友');
                let interactionStatus = '';
                if (post.likes && post.likes.includes(aiName)) interactionStatus += " [你已点赞]";
                if (post.comments && post.comments.some(c => c.commenterName === aiName)) interactionStatus += " [你已评论]";
                if (post.authorId === chatId) authorName += " (这是你的帖子)";
                const contentSummary = (post.publicText || post.content || "图片动态").substring(0, 30) + '...';
                postsContext += `- (ID: ${post.id}) 作者: ${authorName}, 内容: "${contentSummary}"${interactionStatus}\n`;
            }
            messagesPayload.push({ role: 'system', content: postsContext });
        }
    
        // 使用統一API調用
        const aiResponseContent = await callApiUnified([{ role: 'system', content: systemPrompt }, ...messagesPayload], 0.8);
        console.log(`AI '${chat.name}' 的原始回复:`, aiResponseContent);

        chat.history = chat.history.filter(msg => !msg.isTemporary);

        // 檢查AI回應是否需要生成圖片
        const imagePromptData = extractImagePromptFromResponse(aiResponseContent);
        let processedResponse = aiResponseContent;
        
        if (imagePromptData) {
            console.log('[圖片prompt檢測] 發現圖片生成需求:', imagePromptData.prompt);
            // 使用清理後的回應進行解析
            processedResponse = imagePromptData.cleanResponse;
            
            // 通知後端生成圖片
            window.notifyBackendImageGeneration(imagePromptData.prompt, chatId);
        }

        const messagesArray = parseAiResponse(processedResponse);
        
        const isViewingThisChat = document.getElementById('chat-interface-screen').classList.contains('active') && state.activeChatId === chatId;
        
        let callHasBeenHandled = false;

        let messageTimestamp = Date.now();

        // ★★★ 核心修复 第1步: 初始化一个新数组，用于收集需要渲染的消息 ★★★
        let newMessagesToRender = []; 

        for (const msgData of messagesArray) {
            if (!msgData || typeof msgData !== 'object') {
                console.warn("收到了格式不规范的AI指令，已跳过:", msgData);
                continue;
            }
             
            if (!msgData.type) {
                if (chat.isGroup && msgData.name && msgData.message) {
                    msgData.type = 'text';
                } else {
                    console.warn("收到了格式不规范的AI指令（缺少type），已跳过:", msgData);
                    continue;
                }
            }

            if (msgData.type === 'video_call_response') {
                videoCallState.isAwaitingResponse = false;
                if (msgData.decision === 'accept') {
                    startVideoCall();
                } else {
                    const aiMessage = { role: 'assistant', content: '对方拒绝了你的视频通话请求。', timestamp: Date.now() };
                    chat.history.push(aiMessage);
                    await db.chats.put(chat);
                    showScreen('chat-interface-screen');
                    renderChatInterface(chatId);
                }
                callHasBeenHandled = true;
                break;
            }
            
            if (msgData.type === 'group_call_response') {
                if (msgData.decision === 'join') {
                    const member = chat.members.find(m => m.name === msgData.name);
                    if (member && !videoCallState.participants.some(p => p.id === member.id)) {
                        videoCallState.participants.push(member);
                    }
                }
                callHasBeenHandled = true;
                continue;
            }

            if (chat.isGroup && msgData.name && msgData.name === chat.name) {
                console.error(`AI幻觉已被拦截！试图使用群名 ("${chat.name}") 作为角色名。消息内容:`, msgData);
                continue;
            }

            let aiMessage = null;
            const baseMessage = { role: 'assistant', senderName: msgData.name || chat.name, timestamp: messageTimestamp++ };

            switch (msgData.type) {
                case 'waimai_response':
                    const requestMessageIndex = chat.history.findIndex(m => m.timestamp === msgData.for_timestamp);
                    if (requestMessageIndex > -1) {
                        const originalMsg = chat.history[requestMessageIndex];
                        originalMsg.status = msgData.status;
                        originalMsg.paidBy = msgData.status === 'paid' ? msgData.name : null;
                    }
                    continue;

                case 'qzone_post':
                    const newPost = { type: msgData.postType, content: msgData.content || '', publicText: msgData.publicText || '', hiddenContent: msgData.hiddenContent || '', timestamp: Date.now(), authorId: chatId, visibleGroupIds: null };
                    await db.qzonePosts.add(newPost);
                    updateUnreadIndicator(unreadPostsCount + 1);
                    if (isViewingThisChat && document.getElementById('qzone-screen').classList.contains('active')) {
                       await renderQzonePosts();
                    }
                    continue;

                case 'qzone_comment':
                    const postToComment = await db.qzonePosts.get(parseInt(msgData.postId));
                    if (postToComment) {
                        if (!postToComment.comments) postToComment.comments = [];
                        postToComment.comments.push({ commenterName: chat.name, text: msgData.commentText, timestamp: Date.now() });
                        await db.qzonePosts.update(postToComment.id, { comments: postToComment.comments });
                        updateUnreadIndicator(unreadPostsCount + 1);
                        if (isViewingThisChat && document.getElementById('qzone-screen').classList.contains('active')) {
                           await renderQzonePosts();
                        }
                    }
                    continue;

                case 'qzone_like':
                   const postToLike = await db.qzonePosts.get(parseInt(msgData.postId));
                   if (postToLike) {
                       if (!postToLike.likes) postToLike.likes = [];
                       if (!postToLike.likes.includes(chat.name)) {
                           postToLike.likes.push(chat.name);
                           await db.qzonePosts.update(postToLike.id, { likes: postToLike.likes });
                           updateUnreadIndicator(unreadPostsCount + 1);
                           if (isViewingThisChat && document.getElementById('qzone-screen').classList.contains('active')) {
                              await renderQzonePosts();
                           }
                       }
                   }
                    continue;

                case 'video_call_request':
                    if (!videoCallState.isActive && !videoCallState.isAwaitingResponse) {
                        state.activeChatId = chatId;
                        videoCallState.activeChatId = chatId; 
                        videoCallState.isAwaitingResponse = true;
                        videoCallState.isGroupCall = chat.isGroup;
                        videoCallState.callRequester = msgData.name || chat.name;
                        showIncomingCallModal();
                    }
                    continue;

            case 'group_call_request':
                if (!videoCallState.isActive && !videoCallState.isAwaitingResponse) {
                    state.activeChatId = chatId;
                    videoCallState.isAwaitingResponse = true;
                    videoCallState.isGroupCall = true;
                    videoCallState.initiator = 'ai';
                    videoCallState.callRequester = msgData.name;
                    showIncomingCallModal();
                }
                continue;

                case 'pat_user':
                    const suffix = msgData.suffix ? ` ${msgData.suffix.trim()}` : '';
                    const patText = `${msgData.name || chat.name} 拍了拍我${suffix}`;
                    const patMessage = { 
                        role: 'system', 
                        type: 'pat_message', 
                        content: patText, 
                        timestamp: Date.now() 
                    };
                    chat.history.push(patMessage);
                    if (isViewingThisChat) {
                        const phoneScreen = document.getElementById('phone-screen');
                        phoneScreen.classList.remove('pat-animation');
                        void phoneScreen.offsetWidth;
                        phoneScreen.classList.add('pat-animation');
                        setTimeout(() => phoneScreen.classList.remove('pat-animation'), 500);
                        appendMessage(patMessage, chat);
                    } else {
                        showNotification(chatId, patText);
                    }
                    continue; 

                case 'update_status':
                    chat.status.text = msgData.status_text;
                    chat.status.isBusy = msgData.is_busy || false;
                    chat.status.lastUpdate = Date.now();
                    
                    const statusUpdateMessage = {
                        role: 'system',
                        type: 'pat_message',
                        content: `[${chat.name}的状态已更新为: ${msgData.status_text}]`,
                        timestamp: Date.now()
                    };
                    chat.history.push(statusUpdateMessage);

                    if (isViewingThisChat) {
                        appendMessage(statusUpdateMessage, chat);
                    }
                    
                    renderChatList(); 
                    
                    continue; 

                case 'change_music':
                    if (musicState.isActive && musicState.activeChatId === chatId) {
                        const songNameToFind = msgData.song_name;
                        
                        const targetSongIndex = musicState.playlist.findIndex(
                            track => track.name.toLowerCase() === songNameToFind.toLowerCase()
                        );

                        if (targetSongIndex > -1) {
                            playSong(targetSongIndex);

                            const track = musicState.playlist[targetSongIndex];
                            const musicChangeMessage = {
                                role: 'system',
                                type: 'pat_message',
                                content: `[♪ ${chat.name} 为你切歌: 《${track.name}》 - ${track.artist}]`,
                                timestamp: Date.now()
                            };
                            chat.history.push(musicChangeMessage);

                            if (isViewingThisChat) {
                                appendMessage(musicChangeMessage, chat);
                            }
                        }
                    }
                    continue;
                case 'create_memory':
                    const newMemory = {
                        chatId: chatId,
                        authorName: chat.name,
                        description: msgData.description,
                        timestamp: Date.now(),
                        type: 'ai_generated'
                    };
                    await db.memories.add(newMemory);

                    console.log(`AI "${chat.name}" 记录了一条新回忆:`, msgData.description);
                    
                    continue; 

        case 'create_countdown':
            const targetDate = new Date(msgData.date);
            if (!isNaN(targetDate) && targetDate > new Date()) {
                const newCountdown = {
                    chatId: chatId,
                    authorName: chat.name,
                    description: msgData.title,
                    timestamp: Date.now(),
                    type: 'countdown',
                    targetDate: targetDate.getTime()
                };
                await db.memories.add(newCountdown);
                console.log(`AI "${chat.name}" 创建了一个新约定:`, msgData.title);
            }
            continue;

    case 'block_user':
        if (!chat.isGroup) {
            chat.relationship.status = 'blocked_by_ai';
            await db.chats.put(chat);
            
            if (isViewingThisChat) {
                renderChatInterface(chatId);
            }
            renderChatList();
            
            break; 
        }
        continue;
                case 'friend_request_response':
                    if (!chat.isGroup && chat.relationship.status === 'pending_ai_approval') {
                        if (msgData.decision === 'accept') {
                            chat.relationship.status = 'friend';
                            aiMessage = { ...baseMessage, content: "我通过了你的好友申请，我们现在是好友啦！" };
                        } else {
                            chat.relationship.status = 'blocked_by_ai';
                            aiMessage = { ...baseMessage, content: "抱歉，我拒绝了你的好友申请。" };
                        }
                        chat.relationship.applicationReason = '';
                    }
                    break;
                case 'poll':
                    const pollOptions = typeof msgData.options === 'string'
                        ? msgData.options.split('\n').filter(opt => opt.trim())
                        : (Array.isArray(msgData.options) ? msgData.options : []);
                    
                    if (pollOptions.length < 2) continue;

                    aiMessage = {
                        ...baseMessage,
                        type: 'poll',
                        question: msgData.question,
                        options: pollOptions,
                        votes: {},
                        isClosed: false,
                    };
                    break;
                
                case 'vote':
                    const pollToVote = chat.history.find(m => m.timestamp === msgData.poll_timestamp);
                    if (pollToVote && !pollToVote.isClosed) {
                        Object.keys(pollToVote.votes).forEach(option => {
                            const voterIndex = pollToVote.votes[option].indexOf(msgData.name);
                            if (voterIndex > -1) {
                                pollToVote.votes[option].splice(voterIndex, 1);
                            }
                        });
                        if (!pollToVote.votes[msgData.choice]) {
                            pollToVote.votes[msgData.choice] = [];
                        }
                        if (!pollToVote.votes[msgData.choice].includes(msgData.name)) {
                            pollToVote.votes[msgData.choice].push(msgData.name);
                        }                        
                        
                        if (isViewingThisChat) {
                            renderChatInterface(chatId);
                        }
                    }
                    continue;

    case 'red_packet':
        aiMessage = {
            ...baseMessage,
            type: 'red_packet',
            packetType: msgData.packetType,
            totalAmount: msgData.amount,
            count: msgData.count,
            greeting: msgData.greeting,
            receiverName: msgData.receiver,
            claimedBy: {},
            isFullyClaimed: false,
        };
        break;
case 'open_red_packet':
    const packetToOpen = chat.history.find(m => m.timestamp === msgData.packet_timestamp);
    if (packetToOpen && !packetToOpen.isFullyClaimed && !(packetToOpen.claimedBy && packetToOpen.claimedBy[msgData.name])) {
        
        let claimedAmountAI = 0;
        const remainingAmount = packetToOpen.totalAmount - Object.values(packetToOpen.claimedBy || {}).reduce((sum, val) => sum + val, 0);
        const remainingCount = packetToOpen.count - Object.keys(packetToOpen.claimedBy || {}).length;

        if (remainingCount > 0) {
            if (remainingCount === 1) { claimedAmountAI = remainingAmount; } 
            else {
                const min = 0.01;
                const max = remainingAmount - (remainingCount - 1) * min;
                claimedAmountAI = Math.random() * (max - min) + min;
            }
            claimedAmountAI = parseFloat(claimedAmountAI.toFixed(2));
            
            if (!packetToOpen.claimedBy) packetToOpen.claimedBy = {};
            packetToOpen.claimedBy[msgData.name] = claimedAmountAI;
            
            const aiClaimedMessage = {
                role: 'system',
                type: 'pat_message',
                content: `${msgData.name} 领取了 ${packetToOpen.senderName} 的红包`,
                timestamp: Date.now()
            };
            chat.history.push(aiClaimedMessage);

            let hiddenContentForAI = `[系统提示：你 (${msgData.name}) 成功抢到了 ${claimedAmountAI.toFixed(2)} 元。`;

            if (Object.keys(packetToOpen.claimedBy).length >= packetToOpen.count) {
                packetToOpen.isFullyClaimed = true;
                
                const finishedMessage = {
                    role: 'system',
                    type: 'pat_message',
                    content: `${packetToOpen.senderName} 的红包已被领完`,
                    timestamp: Date.now() + 1
                };
                chat.history.push(finishedMessage);
                
                let luckyKing = { name: '', amount: -1 };
                if (packetToOpen.packetType === 'lucky' && packetToOpen.count > 1) {
                    Object.entries(packetToOpen.claimedBy).forEach(([name, amount]) => {
                        if (amount > luckyKing.amount) {
                            luckyKing = { name, amount };
                        }
                    });
                }
                if (luckyKing.name) {
                     hiddenContentForAI += ` 红包已被领完，手气王是 ${luckyKing.name}！`;
                } else {
                     hiddenContentForAI += ` 红包已被领完。`;
                }
            }
            hiddenContentForAI += ' 请根据这个结果发表你的评论。]';

            const hiddenMessageForAI = {
                role: 'system',
                content: hiddenContentForAI,
                timestamp: Date.now() + 2,
                isHidden: true
            };
            chat.history.push(hiddenMessageForAI);
        }
        
        if (isViewingThisChat) {
            renderChatInterface(chatId);
        }
    }
    continue;
    case 'system_message':
        aiMessage = { role: 'system', type: 'pat_message', content: msgData.content, timestamp: Date.now() };
        break;

  // ▼▼▼ 在这里新增 ▼▼▼
case 'change_avatar':
    const avatarName = msgData.name;
    // 在该角色的头像库中查找
    const foundAvatar = chat.settings.aiAvatarLibrary.find(avatar => avatar.name === avatarName);
    
    if (foundAvatar) {
        // 找到了，就更新头像
        chat.settings.aiAvatar = foundAvatar.url;
        
        // 创建一条系统提示，告知用户头像已更换
        const systemNotice = {
            role: 'system',
            type: 'pat_message', // 复用居中样式
            content: `[${chat.name} 更换了头像]`,
            timestamp: Date.now()
        };
        chat.history.push(systemNotice);
        
        // 如果在当前聊天界面，则实时渲染
        if (isViewingThisChat) {
            appendMessage(systemNotice, chat);
            // 立刻刷新聊天界面以显示新头像
            renderChatInterface(chatId);
        }
    }
    // 处理完后，继续处理AI可能返回的其他消息
    continue;
// ▲▲▲ 新增结束 ▲▲▲
                
                case 'text':
                    aiMessage = { ...baseMessage, content: String(msgData.content || msgData.message) };
                    break;
                case 'sticker':
                    aiMessage = { ...baseMessage, type: 'sticker', content: msgData.url, meaning: msgData.meaning || '' };
                    break;
                case 'ai_image':
                    aiMessage = { ...baseMessage, type: 'ai_image', content: msgData.description };
                    break;
                case 'voice_message':
                    aiMessage = { ...baseMessage, type: 'voice_message', content: msgData.content };
                    break;
                case 'transfer':
                    aiMessage = { ...baseMessage, type: 'transfer', amount: msgData.amount, note: msgData.note, receiverName: msgData.receiver || '我' };
                    break;
                
                case 'waimai_request':
                    aiMessage = { 
                        ...baseMessage, 
                        type: 'waimai_request',
                        productInfo: msgData.productInfo,
                        amount: msgData.amount,
                        status: 'pending',
                        countdownEndTime: Date.now() + 15 * 60 * 1000,
                    };
                    break;
                
                default:
                     console.warn("收到了未知的AI指令类型:", msgData.type);
                     break;
            }

            // 【核心修复】将渲染逻辑移出循环
            if (aiMessage) {
                // 1. 将新消息存入历史记录
                chat.history.push(aiMessage);
                
                // 2. 只有在当前聊天界面时，才执行带动画的添加
                if (isViewingThisChat) {
                    appendMessage(aiMessage, chat);
                    // 3. 【关键】在这里暂停一小会儿，给动画播放的时间
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 1800 + 1000));
                }
            }
  }
        
        // ★★★ 核心修复 第4步: 修正通知逻辑，确保它看的是新消息列表，而不是旧的整个数组 ★★★
        const firstNewMessage = newMessagesToRender[0];
        if (!isViewingThisChat && firstNewMessage) {
            let notificationText;

            if (firstNewMessage.type === 'transfer') notificationText = `[收到一笔转账]`;
            else if (firstNewMessage.type === 'waimai_request') notificationText = `[收到一个外卖代付请求]`;
            else if (firstNewMessage.type === 'ai_image') notificationText = `[图片]`;
            else if (firstNewMessage.type === 'voice_message') notificationText = `[语音]`;
            else notificationText = STICKER_REGEX.test(firstNewMessage.content) ? '[表情]' : String(firstNewMessage.content);
            const finalNotifText = chat.isGroup ? `${firstNewMessage.senderName}: ${notificationText}` : notificationText;
            showNotification(chatId, finalNotifText);
        }

        if (callHasBeenHandled && videoCallState.isGroupCall) {
            videoCallState.isAwaitingResponse = false;
            if (videoCallState.participants.length > 0) {
                startVideoCall();
            } else {
                videoCallState = { ...videoCallState, isAwaitingResponse: false, participants: [] };
                showScreen('chat-interface-screen');
                alert('无人接听群聊邀请。');
            }
        }
        
        await db.chats.put(chat);

    } catch (error) {
        chat.history = chat.history.filter(msg => !msg.isTemporary);
        if (!chat.isGroup && chat.relationship?.status === 'pending_ai_approval') {
            chat.relationship.status = 'blocked_by_ai';
            await showCustomAlert('申请失败', `AI在处理你的好友申请时出错了，请稍后重试。\n错误信息: ${error.message}`);
        } else {
            const errorContent = `[出错了: ${error.message}]`;
            const errorMessage = { role: 'assistant', content: errorContent, timestamp: Date.now() };
            if(chat.isGroup) errorMessage.senderName = "系统消息";
            chat.history.push(errorMessage);
        }
        
        await db.chats.put(chat);        
        videoCallState.isAwaitingResponse = false;

        if(document.getElementById('chat-interface-screen').classList.contains('active') && state.activeChatId === chatId) {
            renderChatInterface(chatId);
        }
    } finally {
                // 【动画核心 2/2】: 所有操作结束后，用动画恢复标题
        const chatHeaderTitle = document.getElementById('chat-header-title');
        if (chatHeaderTitle && state.chats[chatId]) {
            if (!state.chats[chatId].isGroup) {
                // 先淡出“正在输入...”
                chatHeaderTitle.style.opacity = 0;
                setTimeout(() => {
                    // 再淡入AI的名字
                    chatHeaderTitle.textContent = state.chats[chatId].name;
                    chatHeaderTitle.classList.remove('typing-status');
                    chatHeaderTitle.style.opacity = 1;
                }, 200);
            }
        }
        
        document.getElementById('typing-indicator').style.display = 'none';
        renderChatList();
  }
}

        async function sendSticker(sticker) { if (!state.activeChatId) return; const chat = state.chats[state.activeChatId]; const msg = { role: 'user', content: sticker.url, meaning: sticker.name, timestamp: Date.now() }; chat.history.push(msg); await db.chats.put(chat); appendMessage(msg, chat); renderChatList(); document.getElementById('sticker-panel').classList.remove('visible'); }

        async function sendUserTransfer() { if (!state.activeChatId) return; const amountInput = document.getElementById('transfer-amount'); const noteInput = document.getElementById('transfer-note'); const amount = parseFloat(amountInput.value); const note = noteInput.value.trim(); if (isNaN(amount) || amount < 0 || amount > 9999) { alert('请输入有效的金额 (0 到 9999 之间)！'); return; } const chat = state.chats[state.activeChatId]; const senderName = chat.isGroup ? (chat.settings.myNickname || '我') : '我'; const receiverName = chat.isGroup ? '群聊' : chat.name; const msg = { role: 'user', type: 'transfer', amount: amount, note: note, senderName, receiverName, timestamp: Date.now() }; chat.history.push(msg); await db.chats.put(chat); appendMessage(msg, chat); renderChatList(); document.getElementById('transfer-modal').classList.remove('visible'); amountInput.value = ''; noteInput.value = ''; }

        function enterSelectionMode(initialMsgTimestamp) { if (isSelectionMode) return; isSelectionMode = true; document.getElementById('chat-interface-screen').classList.add('selection-mode'); toggleMessageSelection(initialMsgTimestamp); }

        function exitSelectionMode() {
    cleanupWaimaiTimers(); // <--- 在这里添加这行代码
 if (!isSelectionMode) return; isSelectionMode = false; document.getElementById('chat-interface-screen').classList.remove('selection-mode'); selectedMessages.forEach(ts => { const bubble = document.querySelector(`.message-bubble[data-timestamp="${ts}"]`); if (bubble) bubble.classList.remove('selected'); }); selectedMessages.clear(); }

// ▼▼▼ 请用这个【最终简化版】替换旧的 toggleMessageSelection 函数 ▼▼▼
function toggleMessageSelection(timestamp) {
    // 【核心修正】选择器已简化，不再寻找已删除的 .recalled-message-placeholder
    const elementToSelect = document.querySelector(
        `.message-bubble[data-timestamp="${timestamp}"]`
    );

    if (!elementToSelect) return;

    if (selectedMessages.has(timestamp)) {
        selectedMessages.delete(timestamp);
        elementToSelect.classList.remove('selected');
    } else {
        selectedMessages.add(timestamp);
        elementToSelect.classList.add('selected');
    }
    
    document.getElementById('selection-count').textContent = `已选 ${selectedMessages.size} 条`;
    
    if (selectedMessages.size === 0) {
        exitSelectionMode();
    }
}
// ▲▲▲ 替换结束 ▲▲▲

        function addLongPressListener(element, callback) { 
            let pressTimer; 
            const startPress = (e) => { 
                if(isSelectionMode) return; 
                e.preventDefault(); 
                pressTimer = window.setTimeout(() => callback(e), 500); 
            }; 
            const startPressTouch = (e) => { 
                if(isSelectionMode) return; 
                // 對於觸控事件，不調用preventDefault()以避免passive警告
                pressTimer = window.setTimeout(() => callback(e), 500); 
            }; 
            const cancelPress = () => clearTimeout(pressTimer); 
            
            element.addEventListener('mousedown', startPress); 
            element.addEventListener('mouseup', cancelPress); 
            element.addEventListener('mouseleave', cancelPress); 
            element.addEventListener('touchstart', startPressTouch, { passive: true }); 
            element.addEventListener('touchend', cancelPress); 
            element.addEventListener('touchmove', cancelPress); 
        }

        async function handleListenTogetherClick() { const targetChatId = state.activeChatId; if (!targetChatId) return; if (!musicState.isActive) { startListenTogetherSession(targetChatId); return; } if (musicState.activeChatId === targetChatId) { document.getElementById('music-player-overlay').classList.add('visible'); } else { const oldChatName = state.chats[musicState.activeChatId]?.name || '未知'; const newChatName = state.chats[targetChatId]?.name || '当前'; const confirmed = await showCustomConfirm('切换听歌对象', `您正和「${oldChatName}」听歌。要结束并开始和「${newChatName}」的新会话吗？`, { confirmButtonClass: 'btn-danger' }); if (confirmed) { await endListenTogetherSession(true); await new Promise(resolve => setTimeout(resolve, 50)); startListenTogetherSession(targetChatId); } } }

        async function startListenTogetherSession(chatId) { const chat = state.chats[chatId]; if (!chat) return; musicState.totalElapsedTime = chat.musicData.totalTime || 0; musicState.isActive = true; musicState.activeChatId = chatId; if (musicState.playlist.length > 0) { musicState.currentIndex = 0; } else { musicState.currentIndex = -1; } if(musicState.timerId) clearInterval(musicState.timerId); musicState.timerId = setInterval(() => { if (musicState.isPlaying) { musicState.totalElapsedTime++; updateElapsedTimeDisplay(); } }, 1000); updatePlayerUI(); updatePlaylistUI(); document.getElementById('music-player-overlay').classList.add('visible'); }

        async function endListenTogetherSession(saveState = true) { if (!musicState.isActive) return; const oldChatId = musicState.activeChatId; if (musicState.timerId) clearInterval(musicState.timerId); if (musicState.isPlaying) audioPlayer.pause(); if (saveState && oldChatId && state.chats[oldChatId]) { const chat = state.chats[oldChatId]; chat.musicData.totalTime = musicState.totalElapsedTime; await db.chats.put(chat); } musicState.isActive = false; musicState.activeChatId = null; musicState.totalElapsedTime = 0; musicState.timerId = null; document.getElementById('music-player-overlay').classList.remove('visible'); document.getElementById('music-playlist-panel').classList.remove('visible'); updateListenTogetherIcon(oldChatId, true); }

        function returnToChat() { document.getElementById('music-player-overlay').classList.remove('visible'); document.getElementById('music-playlist-panel').classList.remove('visible'); }

        function updateListenTogetherIcon(chatId, forceReset = false) { const iconImg = document.querySelector('#listen-together-btn img'); if(!iconImg) return; if(forceReset || !musicState.isActive || musicState.activeChatId !== chatId) { iconImg.src = 'https://i.postimg.cc/8kYShvrJ/90-UI-2.png'; iconImg.className = ''; return; } iconImg.src = 'https://i.postimg.cc/vBN7GnQ9/3-FC8-D1596-C5-CFB200-FCB1-D8-C3-A37-A370.png'; iconImg.classList.add('rotating'); if (musicState.isPlaying) iconImg.classList.remove('paused'); else iconImg.classList.add('paused'); }
        window.updateListenTogetherIconProxy = updateListenTogetherIcon;

        function updatePlayerUI() { updateListenTogetherIcon(musicState.activeChatId); updateElapsedTimeDisplay(); const titleEl = document.getElementById('music-player-song-title'); const artistEl = document.getElementById('music-player-artist'); const playPauseBtn = document.getElementById('music-play-pause-btn'); if (musicState.currentIndex > -1 && musicState.playlist.length > 0) { const track = musicState.playlist[musicState.currentIndex]; titleEl.textContent = track.name; artistEl.textContent = track.artist; } else { titleEl.textContent = '请添加歌曲'; artistEl.textContent = '...'; } playPauseBtn.textContent = musicState.isPlaying ? '❚❚' : '▶'; }

        function updateElapsedTimeDisplay() { const hours = (musicState.totalElapsedTime / 3600).toFixed(1); document.getElementById('music-time-counter').textContent = `已经一起听了${hours}小时`; }

        function updatePlaylistUI() { const playlistBody = document.getElementById('playlist-body'); playlistBody.innerHTML = ''; if (musicState.playlist.length === 0) { playlistBody.innerHTML = '<p style="text-align:center; padding: 20px; color: #888;">播放列表是空的~</p>'; return; } musicState.playlist.forEach((track, index) => { const item = document.createElement('div'); item.className = 'playlist-item'; if(index === musicState.currentIndex) item.classList.add('playing'); item.innerHTML = `<div class="playlist-item-info"><div class="title">${track.name}</div><div class="artist">${track.artist}</div></div><span class="delete-track-btn" data-index="${index}">&times;</span>`; item.querySelector('.playlist-item-info').addEventListener('click', () => playSong(index)); item.querySelector('.delete-track-btn').addEventListener('click', async (e) => { e.stopPropagation(); const confirmed = await showCustomConfirm('删除歌曲', `确定要从播放列表中删除《${track.name}》吗？`); if(confirmed) deleteTrack(index); }); playlistBody.appendChild(item); }); }

        function playSong(index) { if (index < 0 || index >= musicState.playlist.length) return; musicState.currentIndex = index; const track = musicState.playlist[index]; if (track.isLocal && track.src instanceof Blob) { audioPlayer.src = URL.createObjectURL(track.src); } else if (!track.isLocal) { audioPlayer.src = track.src; } else { console.error('本地歌曲源错误:', track); return; } audioPlayer.play(); updatePlaylistUI(); updatePlayerUI(); }

        function togglePlayPause() { if (audioPlayer.paused) { if (musicState.currentIndex === -1 && musicState.playlist.length > 0) { playSong(0); } else if (musicState.currentIndex > -1) { audioPlayer.play(); } } else { audioPlayer.pause(); } }

        function playNext() { if (musicState.playlist.length === 0) return; let nextIndex; switch(musicState.playMode) { case 'random': nextIndex = Math.floor(Math.random() * musicState.playlist.length); break; case 'single': playSong(musicState.currentIndex); return; case 'order': default: nextIndex = (musicState.currentIndex + 1) % musicState.playlist.length; break; } playSong(nextIndex); }

        function playPrev() { if (musicState.playlist.length === 0) return; const newIndex = (musicState.currentIndex - 1 + musicState.playlist.length) % musicState.playlist.length; playSong(newIndex); }

        function changePlayMode() { const modes = ['order', 'random', 'single']; const currentModeIndex = modes.indexOf(musicState.playMode); musicState.playMode = modes[(currentModeIndex + 1) % modes.length]; document.getElementById('music-mode-btn').textContent = {'order': '顺序', 'random': '随机', 'single': '单曲'}[musicState.playMode]; }

        async function addSongFromURL() { const url = await showCustomPrompt("添加网络歌曲", "请输入歌曲的URL", "", "url"); if (!url) return; const name = await showCustomPrompt("歌曲信息", "请输入歌名"); if (!name) return; const artist = await showCustomPrompt("歌曲信息", "请输入歌手名"); if (!artist) return; musicState.playlist.push({ name, artist, src: url, isLocal: false }); await saveGlobalPlaylist(); updatePlaylistUI(); if(musicState.currentIndex === -1) { musicState.currentIndex = musicState.playlist.length - 1; updatePlayerUI(); } }

        async function addSongFromLocal(event) { const files = event.target.files; if (!files.length) return; for (const file of files) { const name = await showCustomPrompt("歌曲信息", "请输入歌名", ""); if (name === null) continue; const artist = await showCustomPrompt("歌曲信息", "请输入歌手名", ""); if (artist === null) continue; musicState.playlist.push({ name, artist, src: file, isLocal: true }); } await saveGlobalPlaylist(); updatePlaylistUI(); if (musicState.currentIndex === -1 && musicState.playlist.length > 0) { musicState.currentIndex = 0; updatePlayerUI(); } event.target.value = null; }

        async function deleteTrack(index) { if (index < 0 || index >= musicState.playlist.length) return; const track = musicState.playlist[index]; const wasPlaying = musicState.isPlaying && musicState.currentIndex === index; if (track.isLocal && audioPlayer.src.startsWith('blob:') && musicState.currentIndex === index) URL.revokeObjectURL(audioPlayer.src); musicState.playlist.splice(index, 1); await saveGlobalPlaylist(); if (musicState.playlist.length === 0) { if (musicState.isPlaying) audioPlayer.pause(); audioPlayer.src = ''; musicState.currentIndex = -1; musicState.isPlaying = false; } else { if (wasPlaying) { playNext(); } else { if (musicState.currentIndex >= index) musicState.currentIndex = Math.max(0, musicState.currentIndex - 1); } } updatePlayerUI(); updatePlaylistUI(); }

        const personaLibraryModal = document.getElementById('persona-library-modal');
        const personaEditorModal = document.getElementById('persona-editor-modal');
        const presetActionsModal = document.getElementById('preset-actions-modal');

        function openPersonaLibrary() { renderPersonaLibrary(); personaLibraryModal.classList.add('visible'); }

        function closePersonaLibrary() { personaLibraryModal.classList.remove('visible'); }

        function renderPersonaLibrary() { const grid = document.getElementById('persona-library-grid'); grid.innerHTML = ''; if (state.personaPresets.length === 0) { grid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1; text-align: center; margin-top: 20px;">空空如也~ 点击右上角"添加"来创建你的第一个人设预设吧！</p>'; return; } state.personaPresets.forEach(preset => { const item = document.createElement('div'); item.className = 'persona-preset-item'; item.style.backgroundImage = `url(${preset.avatar})`; item.dataset.presetId = preset.id; item.addEventListener('click', () => applyPersonaPreset(preset.id)); addLongPressListener(item, () => showPresetActions(preset.id)); grid.appendChild(item); }); }

        function showPresetActions(presetId) { editingPersonaPresetId = presetId; presetActionsModal.classList.add('visible'); }

        function hidePresetActions() { presetActionsModal.classList.remove('visible'); editingPersonaPresetId = null; }

        function applyPersonaPreset(presetId) { const preset = state.personaPresets.find(p => p.id === presetId); if (preset) { document.getElementById('my-avatar-preview').src = preset.avatar; document.getElementById('my-persona').value = preset.persona; } closePersonaLibrary(); }

        function openPersonaEditorForCreate() { editingPersonaPresetId = null; document.getElementById('persona-editor-title').textContent = '添加人设预设'; document.getElementById('preset-avatar-preview').src = defaultAvatar; document.getElementById('preset-persona-input').value = ''; personaEditorModal.classList.add('visible'); }

        function openPersonaEditorForEdit() { const preset = state.personaPresets.find(p => p.id === editingPersonaPresetId); if (!preset) return; document.getElementById('persona-editor-title').textContent = '编辑人设预设'; document.getElementById('preset-avatar-preview').src = preset.avatar; document.getElementById('preset-persona-input').value = preset.persona; presetActionsModal.classList.remove('visible'); personaEditorModal.classList.add('visible'); }

        async function deletePersonaPreset() { const confirmed = await showCustomConfirm('删除预设', '确定要删除这个人设预设吗？此操作不可恢复。', { confirmButtonClass: 'btn-danger' }); if (confirmed && editingPersonaPresetId) { await db.personaPresets.delete(editingPersonaPresetId); state.personaPresets = state.personaPresets.filter(p => p.id !== editingPersonaPresetId); hidePresetActions(); renderPersonaLibrary(); } }

        function closePersonaEditor() { personaEditorModal.classList.remove('visible'); editingPersonaPresetId = null; }

        async function savePersonaPreset() { const avatar = document.getElementById('preset-avatar-preview').src; const persona = document.getElementById('preset-persona-input').value.trim(); if (avatar === defaultAvatar && !persona) { alert("头像和人设不能都为空哦！"); return; } if (editingPersonaPresetId) { const preset = state.personaPresets.find(p => p.id === editingPersonaPresetId); if (preset) { preset.avatar = avatar; preset.persona = persona; await db.personaPresets.put(preset); } } else { const newPreset = { id: 'preset_' + Date.now(), avatar: avatar, persona: persona }; await db.personaPresets.add(newPreset); state.personaPresets.push(newPreset); } renderPersonaLibrary(); closePersonaEditor(); }

        const batteryAlertModal = document.getElementById('battery-alert-modal');

        function showBatteryAlert(imageUrl, text) { clearTimeout(batteryAlertTimeout); document.getElementById('battery-alert-image').src = imageUrl; document.getElementById('battery-alert-text').textContent = text; batteryAlertModal.classList.add('visible'); const closeAlert = () => { batteryAlertModal.classList.remove('visible'); batteryAlertModal.removeEventListener('click', closeAlert); }; batteryAlertModal.addEventListener('click', closeAlert); batteryAlertTimeout = setTimeout(closeAlert, 2000); }

        function updateBatteryDisplay(battery) { const batteryContainer = document.getElementById('status-bar-battery'); const batteryLevelEl = batteryContainer.querySelector('.battery-level'); const batteryTextEl = batteryContainer.querySelector('.battery-text'); const level = Math.floor(battery.level * 100); batteryLevelEl.style.width = `${level}%`; batteryTextEl.textContent = `${level}%`; if (battery.charging) { batteryContainer.classList.add('charging'); } else { batteryContainer.classList.remove('charging'); } }

        function handleBatteryChange(battery) { updateBatteryDisplay(battery); const level = battery.level; if (!battery.charging) { if (level <= 0.4 && lastKnownBatteryLevel > 0.4 && !alertFlags.hasShown40) { showBatteryAlert('https://i.postimg.cc/T2yKJ0DV/40.jpg', '有点饿了，可以去找充电器惹'); alertFlags.hasShown40 = true; } if (level <= 0.2 && lastKnownBatteryLevel > 0.2 && !alertFlags.hasShown20) { showBatteryAlert('https://i.postimg.cc/qB9zbKs9/20.jpg', '赶紧的充电，要饿死了'); alertFlags.hasShown20 = true; } if (level <= 0.1 && lastKnownBatteryLevel > 0.1 && !alertFlags.hasShown10) { showBatteryAlert('https://i.postimg.cc/ThMMVfW4/10.jpg', '已阵亡，还有30秒爆炸'); alertFlags.hasShown10 = true; } } if (level > 0.4) alertFlags.hasShown40 = false; if (level > 0.2) alertFlags.hasShown20 = false; if (level > 0.1) alertFlags.hasShown10 = false; lastKnownBatteryLevel = level; }

        async function initBatteryManager() { if ('getBattery' in navigator) { try { const battery = await navigator.getBattery(); lastKnownBatteryLevel = battery.level; handleBatteryChange(battery); battery.addEventListener('levelchange', () => handleBatteryChange(battery)); battery.addEventListener('chargingchange', () => { handleBatteryChange(battery); if (battery.charging) { showBatteryAlert('https://i.postimg.cc/3NDQ0dWG/image.jpg', '窝爱泥，电量吃饱饱'); } }); } catch (err) { console.error("无法获取电池信息:", err); document.querySelector('.battery-text').textContent = 'ᗜωᗜ'; } } else { console.log("浏览器不支持电池状态API。"); document.querySelector('.battery-text').textContent = 'ᗜωᗜ'; } }

        function openFrameSelectorModal(type = 'chat') {
            if (!state.activeChatId) return;
            const chat = state.chats[state.activeChatId];
            editingFrameForMember = (type === 'member');
            if (editingFrameForMember) {
                const member = chat.members.find(m => m.id === editingMemberId);
                if (!member) return;
                currentFrameSelection.my = member.avatarFrame || '';
                populateFrameGrids(true, member.avatar, member.avatarFrame);
            } else {
                currentFrameSelection.ai = chat.settings.aiAvatarFrame || '';
                currentFrameSelection.my = chat.settings.myAvatarFrame || '';
                populateFrameGrids(false);
            }
            frameModal.classList.add('visible');
        }

        function populateFrameGrids(isForMember = false, memberAvatar = null, memberFrame = null) {
            const chat = state.chats[state.activeChatId];
            aiFrameGrid.innerHTML = '';
            myFrameGrid.innerHTML = '';

            document.querySelector('.frame-tabs').style.display = isForMember ? 'none' : 'flex';
            aiFrameContent.style.display = 'block';
            myFrameContent.style.display = 'none';
            aiFrameTab.classList.add('active');
            myFrameTab.classList.remove('active');

            if (isForMember) {
                avatarFrames.forEach(frame => {
                    const item = createFrameItem(frame, 'my', memberAvatar);
                    if (frame.url === memberFrame) {
                        item.classList.add('selected');
                    }
                    aiFrameGrid.appendChild(item);
                });
            } else {
                const aiAvatarForPreview = chat.settings.aiAvatar || defaultAvatar;
                const myAvatarForPreview = chat.settings.myAvatar || (chat.isGroup ? defaultMyGroupAvatar : defaultAvatar);
                avatarFrames.forEach(frame => {
                    const aiItem = createFrameItem(frame, 'ai', aiAvatarForPreview);
                    if (frame.url === currentFrameSelection.ai) aiItem.classList.add('selected');
                    aiFrameGrid.appendChild(aiItem);
                    const myItem = createFrameItem(frame, 'my', myAvatarForPreview);
                    if (frame.url === currentFrameSelection.my) myItem.classList.add('selected');
                    myFrameGrid.appendChild(myItem);
                });
            }
        }

        function createFrameItem(frame, type, previewAvatarSrc) {
            const item = document.createElement('div');
            item.className = 'frame-item';
            item.dataset.frameUrl = frame.url;
            item.title = frame.name;
            item.innerHTML = `
                <img src="${previewAvatarSrc}" class="preview-avatar">
                ${frame.url ? `<img src="${frame.url}" class="preview-frame">` : ''}
            `;
            item.addEventListener('click', () => {
                currentFrameSelection[type] = frame.url;
                const grid = type === 'ai' ? aiFrameGrid : myFrameGrid;
                grid.querySelectorAll('.frame-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
            });
            return item;
        }

        async function saveSelectedFrames() {
            if (!state.activeChatId) return;
            const chat = state.chats[state.activeChatId];
            if (editingFrameForMember) {
                const member = chat.members.find(m => m.id === editingMemberId);
                if (member) {
                    member.avatarFrame = currentFrameSelection.my;
                }
            } else {
                chat.settings.aiAvatarFrame = currentFrameSelection.ai;
                chat.settings.myAvatarFrame = currentFrameSelection.my;
            }
            await db.chats.put(chat);
            frameModal.classList.remove('visible');
            renderChatInterface(state.activeChatId);
            alert('头像框已保存！');
            editingFrameForMember = false;
        }

        async function renderAlbumList() {
            const albumGrid = document.getElementById('album-grid-page');
            if (!albumGrid) return;
            const albums = await db.qzoneAlbums.orderBy('createdAt').reverse().toArray();
            albumGrid.innerHTML = '';
            if (albums.length === 0) {
                albumGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); margin-top: 50px;">你还没有创建任何相册哦~</p>';
                return;
            }
            albums.forEach(album => {
                const albumItem = document.createElement('div');
                albumItem.className = 'album-item';
                albumItem.innerHTML = `
                    <div class="album-cover" style="background-image: url(${album.coverUrl});"></div>
                    <div class="album-info">
                        <p class="album-name">${album.name}</p>
                        <p class="album-count">${album.photoCount || 0} 张</p>
                    </div>
                `;
                albumItem.addEventListener('click', () => {
                    openAlbum(album.id);
                });

                // ▼▼▼ 新增的核心代码就是这里 ▼▼▼
                addLongPressListener(albumItem, async () => {
                    const confirmed = await showCustomConfirm(
                        '删除相册',
                        `确定要删除相册《${album.name}》吗？此操作将同时删除相册内的所有照片，且无法恢复。`,
                        { confirmButtonClass: 'btn-danger' }
                    );

                    if (confirmed) {
                        // 1. 从照片表中删除该相册下的所有照片
                        await db.qzonePhotos.where('albumId').equals(album.id).delete();
                        
                        // 2. 从相册表中删除该相册本身
                        await db.qzoneAlbums.delete(album.id);
                        
                        // 3. 重新渲染相册列表
                        await renderAlbumList();
                        
                        alert('相册已成功删除。');
                    }
                });
                // ▲▲▲ 新增代码结束 ▲▲▲

                albumGrid.appendChild(albumItem);
            });
        }

        async function openAlbum(albumId) {
            state.activeAlbumId = albumId;
            await renderAlbumPhotosScreen();
            showScreen('album-photos-screen');
        }

        async function renderAlbumPhotosScreen() {
            if (!state.activeAlbumId) return;
            const photosGrid = document.getElementById('photos-grid-page');
            const headerTitle = document.getElementById('album-photos-title');
            const album = await db.qzoneAlbums.get(state.activeAlbumId);
            if (!album) {
                console.error("找不到相册:", state.activeAlbumId);
                showScreen('album-screen');
                return;
            }
            headerTitle.textContent = album.name;
            const photos = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).toArray();
            photosGrid.innerHTML = '';
            if (photos.length === 0) {
                photosGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); margin-top: 50px;">这个相册还是空的，快上传第一张照片吧！</p>';
            } else {
                photos.forEach(photo => {
                    const photoItem = document.createElement('div');
                    photoItem.className = 'photo-item';
                    photoItem.innerHTML = `
                        <img src="${photo.url}" class="photo-thumb" alt="相册照片">
                        <button class="photo-delete-btn" data-photo-id="${photo.id}">×</button>
                    `;
                    photosGrid.appendChild(photoItem);
                });
            }
        }

// --- ↓↓↓ 从这里开始复制 ↓↓↓ ---

/**
 * 打开图片查看器
 * @param {string} clickedPhotoUrl - 用户点击的那张照片的URL
 */
async function openPhotoViewer(clickedPhotoUrl) {
    if (!state.activeAlbumId) return;

    // 1. 从数据库获取当前相册的所有照片
    const photosInAlbum = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).toArray();
    photoViewerState.photos = photosInAlbum.map(p => p.url);

    // 2. 找到被点击照片的索引
    photoViewerState.currentIndex = photoViewerState.photos.findIndex(url => url === clickedPhotoUrl);
    if (photoViewerState.currentIndex === -1) return; // 如果找不到，则不打开

    // 3. 显示模态框并渲染第一张图
    document.getElementById('photo-viewer-modal').classList.add('visible');
    renderPhotoViewer();
    photoViewerState.isOpen = true;
}

/**
 * 根据当前状态渲染查看器内容（图片和按钮）
 */
function renderPhotoViewer() {
    if (photoViewerState.currentIndex === -1) return;

    const imageEl = document.getElementById('photo-viewer-image');
    const prevBtn = document.getElementById('photo-viewer-prev-btn');
    const nextBtn = document.getElementById('photo-viewer-next-btn');
    
    // 淡出效果
    imageEl.style.opacity = 0;

    setTimeout(() => {
        // 更新图片源
        imageEl.src = photoViewerState.photos[photoViewerState.currentIndex];
        // 淡入效果
        imageEl.style.opacity = 1;
    }, 100); // 延迟一点点时间来触发CSS过渡

    // 更新按钮状态：如果是第一张，禁用“上一张”按钮
    prevBtn.disabled = photoViewerState.currentIndex === 0;
    // 如果是最后一张，禁用“下一张”按钮
    nextBtn.disabled = photoViewerState.currentIndex === photoViewerState.photos.length - 1;
}

/**
 * 显示下一张照片
 */
function showNextPhoto() {
    if (photoViewerState.currentIndex < photoViewerState.photos.length - 1) {
        photoViewerState.currentIndex++;
        renderPhotoViewer();
    }
}

/**
 * 显示上一张照片
 */
function showPrevPhoto() {
    if (photoViewerState.currentIndex > 0) {
        photoViewerState.currentIndex--;
        renderPhotoViewer();
    }
}

/**
 * 关闭图片查看器
 */
function closePhotoViewer() {
    document.getElementById('photo-viewer-modal').classList.remove('visible');
    photoViewerState.isOpen = false;
    photoViewerState.photos = [];
    photoViewerState.currentIndex = -1;
    // 清空图片，避免下次打开时闪现旧图
    document.getElementById('photo-viewer-image').src = '';
}

// --- ↑↑↑ 复制到这里结束 ↑↑↑ ---
        // ▼▼▼ 请将这个新函数粘贴到你的JS功能函数定义区 ▼▼▼
        
        /**
         * 更新动态小红点的显示
         * @param {number} count - 未读动态的数量
         */
        function updateUnreadIndicator(count) {
            unreadPostsCount = count;
            localStorage.setItem('unreadPostsCount', count); // 持久化存储

            // --- 更新底部导航栏的“动态”按钮 ---
            const navItem = document.querySelector('.nav-item[data-view="qzone-screen"]');
            
            const targetSpan = navItem.querySelector('span'); // 定位到文字 "动态"
            let indicator = navItem.querySelector('.unread-indicator');           

            if (count > 0) {
                if (!indicator) {
                    indicator = document.createElement('span');
                    indicator.className = 'unread-indicator';
                                                           targetSpan.style.position = 'relative'; // 把相对定位加在 span 上
                    targetSpan.appendChild(indicator); // 把小红点作为 span 的子元素
                    
                }
                indicator.textContent = count > 99 ? '99+' : count;
                indicator.style.display = 'block';
            } else {
                if (indicator) {
                    indicator.style.display = 'none';
                }
            }

            // --- 更新聊天界面返回列表的按钮 ---
            const backBtn = document.getElementById('back-to-list-btn');
            let backBtnIndicator = backBtn.querySelector('.unread-indicator');

            if (count > 0) {
                if (!backBtnIndicator) {
                    backBtnIndicator = document.createElement('span');
                    backBtnIndicator.className = 'unread-indicator back-btn-indicator';
                    backBtn.style.position = 'relative'; // 确保能正确定位
                    backBtn.appendChild(backBtnIndicator);
                }
                // 返回键上的小红点通常不显示数字，只显示一个点
                backBtnIndicator.style.display = 'block';
            } else {
                if (backBtnIndicator) {
                    backBtnIndicator.style.display = 'none';
                }
            }
        }
        
        // ▲▲▲ 新函数粘贴结束 ▲▲▲

// ▼▼▼ 将这两个新函数粘贴到你的JS功能函数定义区 ▼▼▼
function startBackgroundSimulation() {
    if (simulationIntervalId) return;
    const intervalSeconds = state.globalSettings.backgroundActivityInterval || 60;
    // 将旧的固定间隔 45000 替换为动态获取
    simulationIntervalId = setInterval(runBackgroundSimulationTick, intervalSeconds * 1000); 
}

function stopBackgroundSimulation() {
    if (simulationIntervalId) {
        clearInterval(simulationIntervalId);
        simulationIntervalId = null;
    }
}
// ▲▲▲ 粘贴结束 ▲▲▲

/**
 * 这是模拟器的“心跳”，每次定时器触发时运行
 */
function runBackgroundSimulationTick() {
    console.log("模拟器心跳 Tick...");
    if (!state.globalSettings.enableBackgroundActivity) {
        stopBackgroundSimulation();
        return;
    }
    const allSingleChats = Object.values(state.chats).filter(chat => !chat.isGroup);

    if (allSingleChats.length === 0) return;

    allSingleChats.forEach(chat => {
        // 【核心修正】将两种状态检查分离开，逻辑更清晰

        // 检查1：处理【被用户拉黑】的角色
        if (chat.relationship?.status === 'blocked_by_user') {
            const blockedTimestamp = chat.relationship.blockedTimestamp;
            // 安全检查：确保有拉黑时间戳
            if (!blockedTimestamp) {
                console.warn(`角色 "${chat.name}" 状态为拉黑，但缺少拉黑时间戳，跳过处理。`);
                return; // 跳过这个角色，继续下一个
            }

            const blockedDuration = Date.now() - blockedTimestamp;
            const cooldownMilliseconds = (state.globalSettings.blockCooldownHours || 1) * 60 * 60 * 1000;

            console.log(`检查角色 "${chat.name}"：已拉黑 ${Math.round(blockedDuration/1000/60)}分钟，冷静期需 ${cooldownMilliseconds/1000/60}分钟。`); // 添加日志

            // 【核心修改】移除了随机概率，只要冷静期一过，就触发！
            if (blockedDuration > cooldownMilliseconds) {
                console.log(`角色 "${chat.name}" 的冷静期已过，触发“反思”并申请好友事件...`);
                
                // 【重要】为了防止在AI响应前重复触发，我们在触发后立刻更新状态
                chat.relationship.status = 'pending_system_reflection'; // 设置一个临时的、防止重复触发的状态
                
                triggerAiFriendApplication(chat.id);
            }
        }
        // 检查2：处理【好友关系】的正常后台活动
        else if (chat.relationship?.status === 'friend' && chat.id !== state.activeChatId) {
            // 这里的随机触发逻辑保持不变，因为我们不希望所有好友同时行动
            if (Math.random() < 0.20) {
                console.log(`角色 "${chat.name}" 被唤醒，准备独立行动...`);
                triggerInactiveAiAction(chat.id);
            }
        }
    });
}

async function triggerInactiveAiAction(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;

    const now = new Date();
    const currentTime = now.toLocaleTimeString('zh-CN', { hour: 'numeric', minute: 'numeric', hour12: true });
    const userNickname = state.qzoneSettings.nickname;

    const lastUserMessage = chat.history.filter(m => m.role === 'user' && !m.isHidden).slice(-1)[0];
    const lastAiMessage = chat.history.filter(m => m.role === 'assistant' && !m.isHidden).slice(-1)[0];
    let recentContextSummary = "你们最近没有聊过天。";
    if (lastUserMessage) {
        recentContextSummary = `用户 (${userNickname}) 最后对你说：“${String(lastUserMessage.content).substring(0, 50)}...”。`;
    }
    if (lastAiMessage) {
        recentContextSummary += `\n你最后对用户说：“${String(lastAiMessage.content).substring(0, 50)}...”。`;
    }

    const systemPrompt = `
# 你的任务
你现在扮演一个名为"${chat.name}"的角色。你已经有一段时间没有和用户（${userNickname}）互动了，现在你有机会【主动】做点什么，来表现你的个性和独立生活。这是一个秘密的、后台的独立行动。

# 你的可选行动 (请根据你的人设【选择一项】执行):
1.  **改变状态**: 去做点别的事情，然后给用户发条消息。
2.  **发布动态**: 分享你的心情或想法到“动态”区。
3.  **与动态互动**: 去看看别人的帖子并进行评论或点赞。
4.  **发起视频通话**: 如果你觉得时机合适，可以主动给用户打一个视频电话。

# 指令格式 (你的回复【必须】是包含一个对象的JSON数组):
-   **发消息+更新状态**: \`[{"type": "update_status", "status_text": "正在做的事", "is_busy": true}, {"type": "text", "content": "你想对用户说的话..."}]\`
-   **发说说**: \`[{"type": "qzone_post", "postType": "shuoshuo", "content": "动态的文字内容..."}]\`
- **发布文字图**: \`{"type": "qzone_post", "postType": "text_image", "publicText": "(可选)动态的公开文字", "hiddenContent": "对于图片的具体描述..."}\`
-   **评论**: \`[{"type": "qzone_comment", "postId": 123, "commentText": "你的评论内容"}]\`
-   **点赞**: \`[{"type": "qzone_like", "postId": 456}]\`
-   **打视频**: \`[{"type": "video_call_request"}]\`

# 供你决策的参考信息：
-   **你的角色设定**: ${chat.settings.aiPersona}
-   **当前时间**: ${currentTime}
-   **你们最后的对话摘要**: ${recentContextSummary}
-   **【重要】最近的动态列表**: 这个列表会标注 **[你已点赞]** 或 **[你已评论]**。请**优先**与你**尚未互动过**的动态进行交流。`;

    // 【核心修复】在这里构建 messagesPayload
    const messagesPayload = [];
    messagesPayload.push({ role: 'system', content: systemPrompt });

    try {
        const recentPosts = await db.qzonePosts.orderBy('timestamp').reverse().limit(3).toArray();
        const aiName = chat.name;
        
        let dynamicContext = ""; // 用一个变量来收集动态上下文
        if (recentPosts.length > 0) {
            let postsContext = "\n\n# 最近的动态列表 (供你参考和评论):\n";
            for (const post of recentPosts) {
                let authorName = post.authorId === 'user' ? userNickname : (state.chats[post.authorId]?.name || '一位朋友');
                let interactionStatus = '';
                if (post.likes && post.likes.includes(aiName)) interactionStatus += " [你已点赞]";
                if (post.comments && post.comments.some(c => c.commenterName === aiName)) interactionStatus += " [你已评论]";
                
                postsContext += `- (ID: ${post.id}) 作者: ${authorName}, 内容: "${(post.publicText || post.content || "图片动态").substring(0, 30)}..."${interactionStatus}\n`;
            }
            dynamicContext = postsContext;
        }

        // 【核心修复】将所有动态信息作为一条 user 消息发送
        messagesPayload.push({
            role: 'user',
            content: `[系统指令：请根据你在 system prompt 中读到的规则和以下最新信息，开始你的独立行动。]\n${dynamicContext}`
        });
        
        console.log("正在为后台活动发送API请求，Payload:", JSON.stringify(messagesPayload, null, 2)); // 添加日志，方便调试

        // 使用統一API調用
        const aiResponse = await callApiUnified(messagesPayload, 0.9);
        // 检查是否有有效回复
        if (!aiResponse || aiResponse.trim() === '') {
            console.warn(`API为空回或格式不正确，角色 "${chat.name}" 的本次后台活动跳过。`);
            return;
        }
        const responseArray = parseAiResponse(aiResponse);
        
        // 后续处理AI返回指令的逻辑保持不变...
        for (const action of responseArray) {
            if (!action) continue;

            if (action.type === 'update_status' && action.status_text) {
                chat.status.text = action.status_text;
                chat.status.isBusy = action.is_busy || false;
                chat.status.lastUpdate = Date.now();
                await db.chats.put(chat);
                renderChatList();
            }
            if (action.type === 'text' && action.content) {
                const aiMessage = { role: 'assistant', content: String(action.content), timestamp: Date.now() };
                chat.history.push(aiMessage);
                await db.chats.put(chat);
                showNotification(chatId, aiMessage.content);
                renderChatList();
                console.log(`后台活动: 角色 "${chat.name}" 主动发送了消息: ${aiMessage.content}`);
            }
            if (action.type === 'qzone_post') {
                const newPost = { type: action.postType, content: action.content || '', publicText: action.publicText || '', hiddenContent: action.hiddenContent || '', timestamp: Date.now(), authorId: chatId, visibleGroupIds: null };
                await db.qzonePosts.add(newPost);
                updateUnreadIndicator(unreadPostsCount + 1);
                console.log(`后台活动: 角色 "${chat.name}" 发布了动态`);
            } else if (action.type === 'qzone_comment') {
                const post = await db.qzonePosts.get(parseInt(action.postId));
                if (post) {
                    if (!post.comments) post.comments = [];
                    post.comments.push({ commenterName: chat.name, text: action.commentText, timestamp: Date.now() });
                    await db.qzonePosts.update(post.id, { comments: post.comments });
                    updateUnreadIndicator(unreadPostsCount + 1);
                    console.log(`后台活动: 角色 "${chat.name}" 评论了动态 #${post.id}`);
                }
            } else if (action.type === 'qzone_like') {
                const post = await db.qzonePosts.get(parseInt(action.postId));
                if (post) {
                    if (!post.likes) post.likes = [];
                    if (!post.likes.includes(chat.name)) {
                        post.likes.push(chat.name);
                        await db.qzonePosts.update(post.id, { likes: post.likes });
                        updateUnreadIndicator(unreadPostsCount + 1);
                        console.log(`后台活动: 角色 "${chat.name}" 点赞了动态 #${post.id}`);
                    }
                }
            } else if (action.type === 'video_call_request') {
                if (!videoCallState.isActive && !videoCallState.isAwaitingResponse) {
                    videoCallState.isAwaitingResponse = true; 
                    state.activeChatId = chatId;
                    showIncomingCallModal();
                    console.log(`后台活动: 角色 "${chat.name}" 发起了视频通话请求`);
                }
            }
        }
    } catch (error) {
        console.error(`角色 "${chat.name}" 的独立行动失败:`, error);
    }
}

// ▼▼▼ 请用这个【终极修正版】函数，完整替换掉你旧的 applyScopedCss 函数 ▼▼▼

/**
 * 将用户自定义的CSS安全地应用到指定的作用域
 * @param {string} cssString 用户输入的原始CSS字符串
 * @param {string} scopeId 应用样式的作用域ID (例如 '#chat-messages' 或 '#settings-preview-area')
 * @param {string} styleTagId 要操作的 <style> 标签的ID
 */
function applyScopedCss(cssString, scopeId, styleTagId) {
    const styleTag = document.getElementById(styleTagId);
    if (!styleTag) return;
    
    if (!cssString || cssString.trim() === '') {
        styleTag.innerHTML = '';
        return;
    }
    
    // 增强作用域处理函数 - 专门解决.user和.ai样式冲突问题
    const scopedCss = cssString
        .replace(/\s*\.message-bubble\.user\s+([^{]+\{)/g, `${scopeId} .message-bubble.user $1`)
        .replace(/\s*\.message-bubble\.ai\s+([^{]+\{)/g, `${scopeId} .message-bubble.ai $1`)
        .replace(/\s*\.message-bubble\s+([^{]+\{)/g, `${scopeId} .message-bubble $1`);
    
    styleTag.innerHTML = scopedCss;
}

// ▼▼▼ 请用这个【修正版】函数，完整替换掉旧的 updateSettingsPreview 函数 ▼▼▼

function updateSettingsPreview() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const previewArea = document.getElementById('settings-preview-area');
    if (!previewArea) return;

    // 1. 获取当前设置的值
    const selectedTheme = document.querySelector('input[name="theme-select"]:checked')?.value || 'default';
    const fontSize = document.getElementById('font-size-slider').value;
    const customCss = document.getElementById('custom-css-input').value;
    const background = chat.settings.background; // 直接获取背景设置

    // 2. 更新预览区的基本样式
    previewArea.dataset.theme = selectedTheme;
    previewArea.style.setProperty('--chat-font-size', `${fontSize}px`);
    
    // --- 【核心修正】直接更新预览区的背景样式 ---
    if (background && background.startsWith('data:image')) {
        previewArea.style.backgroundImage = `url(${background})`;
        previewArea.style.backgroundColor = 'transparent'; // 如果有图片，背景色设为透明
    } else {
        previewArea.style.backgroundImage = 'none'; // 如果没有图片，移除图片背景
        // 如果背景是颜色值或渐变（非图片），则直接应用
        previewArea.style.background = background || '#f0f2f5';
    }

    // 3. 渲染模拟气泡
    previewArea.innerHTML = ''; 

    // 创建“对方”的气泡
    // 注意：我们将一个虚拟的 timestamp 传入，以防有CSS依赖于它
    const aiMsg = { role: 'ai', content: '对方消息预览', timestamp: 1, senderName: chat.name };
    const aiBubble = createMessageElement(aiMsg, chat);
    if(aiBubble) previewArea.appendChild(aiBubble);

    // 创建“我”的气泡
    const userMsg = { role: 'user', content: '我的消息预览', timestamp: 2 };
    const userBubble = createMessageElement(userMsg, chat);
    if(userBubble) previewArea.appendChild(userBubble);
    
    // 4. 应用自定义CSS到预览区
    applyScopedCss(customCss, '#settings-preview-area', 'preview-bubble-style');
}

// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 请将这些【新函数】粘贴到JS功能函数定义区 ▼▼▼

async function openGroupManager() {
    await renderGroupList();
    document.getElementById('group-management-modal').classList.add('visible');
}

async function renderGroupList() {
    const listEl = document.getElementById('existing-groups-list');
    const groups = await db.qzoneGroups.toArray();
    listEl.innerHTML = '';
    if (groups.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分组</p>';
    }
    groups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'existing-group-item';
        item.innerHTML = `
            <span class="group-name">${group.name}</span>
            <span class="delete-group-btn" data-id="${group.id}">×</span>
        `;
        listEl.appendChild(item);
    });
}

// ▼▼▼ 请用这个【修正后】的函数，完整替换旧的 addNewGroup 函数 ▼▼▼
async function addNewGroup() {
    const input = document.getElementById('new-group-name-input');
    const name = input.value.trim();
    if (!name) {
        alert('分组名不能为空！');
        return;
    }

    // 【核心修正】在添加前，先检查分组名是否已存在
    const existingGroup = await db.qzoneGroups.where('name').equals(name).first();
    if (existingGroup) {
        alert(`分组 "${name}" 已经存在了，换个名字吧！`);
        return;
    }
    // 【修正结束】

    await db.qzoneGroups.add({ name });
    input.value = '';
    await renderGroupList();
}
// ▲▲▲ 替换结束 ▲▲▲

async function deleteGroup(groupId) {
    const confirmed = await showCustomConfirm('确认删除', '删除分组后，该组内的好友将变为“未分组”。确定要删除吗？', { confirmButtonClass: 'btn-danger' });
    if (confirmed) {
        await db.qzoneGroups.delete(groupId);
        // 将属于该分组的好友的 groupId 设为 null
        const chatsToUpdate = await db.chats.where('groupId').equals(groupId).toArray();
        for (const chat of chatsToUpdate) {
            chat.groupId = null;
            await db.chats.put(chat);
            if(state.chats[chat.id]) state.chats[chat.id].groupId = null;
        }
        await renderGroupList();
    }
}

// ▲▲▲ 新函数粘贴结束 ▲▲▲

// ▼▼▼ 请将这【一整块新函数】粘贴到JS功能函数定义区的末尾 ▼▼▼

/**
 * 当长按消息时，显示操作菜单
 * @param {number} timestamp - 被长按消息的时间戳
 */
function showMessageActions(timestamp) {
    // 如果已经在多选模式，则不弹出菜单
    if (isSelectionMode) return;
    
    activeMessageTimestamp = timestamp;
    document.getElementById('message-actions-modal').classList.add('visible');
}

/**
 * 隐藏消息操作菜单
 */
function hideMessageActions() {
    document.getElementById('message-actions-modal').classList.remove('visible');
    activeMessageTimestamp = null;
}

// ▼▼▼ 请用这个【带格式助手的终极版】替换旧的 openMessageEditor 函数 ▼▼▼
async function openMessageEditor() {
    if (!activeMessageTimestamp) return;

    const timestampToEdit = activeMessageTimestamp;
    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === timestampToEdit);
    if (!message) return;

    hideMessageActions(); 

    let contentForEditing;
    const isSpecialType = message.type && ['voice_message', 'ai_image', 'transfer'].includes(message.type);

    if (isSpecialType) {
        let fullMessageObject = { type: message.type };
        if (message.type === 'voice_message') fullMessageObject.content = message.content;
        else if (message.type === 'ai_image') fullMessageObject.description = message.content; 
        else if (message.type === 'transfer') {
            fullMessageObject.amount = message.amount;
            fullMessageObject.note = message.note;
        }
        contentForEditing = JSON.stringify(fullMessageObject, null, 2);
    } else if (typeof message.content === 'object') {
        contentForEditing = JSON.stringify(message.content, null, 2);
    } else {
        contentForEditing = message.content;
    }

    // --- 【核心修改】在这里构建“格式助手”按钮的HTML ---
    const templates = {
        voice: { type: 'voice_message', content: '在这里输入语音内容' },
        image: { type: 'ai_image', description: '在这里输入图片描述' },
        transfer: { type: 'transfer', amount: 5.20, note: '一点心意' }
    };

    // 使用 data-template 属性存储JSON模板字符串，注意要用单引号包裹
    const helpersHtml = `
        <div class="format-helpers">
            <button class="format-btn" data-template='${JSON.stringify(templates.voice)}'>语音</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.image)}'>图片</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.transfer)}'>转账</button>
        </div>
    `;
    // --- 【核心修改结束】---

    const newContent = await showCustomPrompt(
        '编辑消息', 
        '在此修改，或点击上方按钮使用格式模板...', // 修改提示语
        contentForEditing, 
        'textarea',
        helpersHtml // 将按钮的HTML作为第5个参数传入
    );

    if (newContent !== null) {
        await saveEditedMessage(timestampToEdit, newContent);
    }
}
// ▲▲▲ 替换结束 ▲▲▲

/**
 * 复制消息的文本内容到剪贴板
 */
async function copyMessageContent() {
    if (!activeMessageTimestamp) return;
    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === activeMessageTimestamp);
    if (!message) return;

    let textToCopy;
    if (typeof message.content === 'object') {
        textToCopy = JSON.stringify(message.content);
    } else {
        textToCopy = String(message.content);
    }

    try {
        await navigator.clipboard.writeText(textToCopy);
        await showCustomAlert('复制成功', '消息内容已复制到剪贴板。');
    } catch (err) {
        await showCustomAlert('复制失败', '无法访问剪贴板。');
    }
    
    hideMessageActions();
}

// ▼▼▼ 【全新】可视化多消息编辑器驱动函数 ▼▼▼

/**
 * 创建一个可编辑的消息块（包含文本框、格式助手和删除按钮）
 * @param {string} initialContent - 文本框的初始内容
 * @returns {HTMLElement} - 创建好的DOM元素
 */
function createMessageEditorBlock(initialContent = '') {
    const block = document.createElement('div');
    block.className = 'message-editor-block';

    const templates = {
        voice: { type: 'voice_message', content: '在这里输入语音内容' },
        image: { type: 'ai_image', description: '在这里输入图片描述' },
        transfer: { type: 'transfer', amount: 5.20, note: '一点心意' }
    };

    block.innerHTML = `
        <button class="delete-block-btn" title="删除此条">×</button>
        <textarea>${initialContent}</textarea>
        <div class="format-helpers">
            <button class="format-btn" data-template='${JSON.stringify(templates.voice)}'>语音</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.image)}'>图片</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.transfer)}'>转账</button>
        </div>
    `;

    // 绑定删除按钮事件
    block.querySelector('.delete-block-btn').addEventListener('click', () => {
        // 确保至少保留一个编辑块
        if (document.querySelectorAll('.message-editor-block').length > 1) {
            block.remove();
        } else {
            alert('至少需要保留一条消息。');
        }
    });

    // 绑定格式助手按钮事件
    block.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const templateStr = btn.dataset.template;
            const textarea = block.querySelector('textarea');
            if (templateStr && textarea) {
                try {
                    const templateObj = JSON.parse(templateStr);
                    textarea.value = JSON.stringify(templateObj, null, 2);
                    textarea.focus();
                } catch(e) { console.error("解析格式模板失败:", e); }
            }
        });
    });

    return block;
}

// ▼▼▼ 【全新升级版】请用此函数完整替换旧的 openAdvancedMessageEditor ▼▼▼
/**
 * 打开全新的、可视化的多消息编辑器，并动态绑定其所有按钮事件
 */
function openAdvancedMessageEditor() {
    if (!activeMessageTimestamp) return;

    // 1. 【核心】在关闭旧菜单前，将需要的时间戳捕获到局部变量中
    const timestampToEdit = activeMessageTimestamp;

    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === timestampToEdit);
    if (!message) return;

    // 2. 现在可以安全地关闭旧菜单了，因为它不会影响我们的局部变量
    hideMessageActions(); 

    const editorModal = document.getElementById('message-editor-modal');
    const editorContainer = document.getElementById('message-editor-container');
    editorContainer.innerHTML = ''; 

    // 3. 准备初始内容
    let initialContent;
    const isSpecialType = message.type && ['voice_message', 'ai_image', 'transfer'].includes(message.type);
    if (isSpecialType) {
        let fullMessageObject = { type: message.type };
        if (message.type === 'voice_message') fullMessageObject.content = message.content;
        else if (message.type === 'ai_image') fullMessageObject.description = message.content;
        else if (message.type === 'transfer') {
            fullMessageObject.amount = message.amount;
            fullMessageObject.note = message.note;
        }
        initialContent = JSON.stringify(fullMessageObject, null, 2);
    } else if (typeof message.content === 'object') {
        initialContent = JSON.stringify(message.content, null, 2);
    } else {
        initialContent = message.content;
    }

    const firstBlock = createMessageEditorBlock(initialContent);
    editorContainer.appendChild(firstBlock);

    // 4. 【核心】动态绑定所有控制按钮的事件
    // 为了防止事件重复绑定，我们使用克隆节点的方法来清除旧监听器
    const addBtn = document.getElementById('add-message-editor-block-btn');
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.addEventListener('click', () => {
        const newBlock = createMessageEditorBlock();
        editorContainer.appendChild(newBlock);
        newBlock.querySelector('textarea').focus();
    });

    const cancelBtn = document.getElementById('cancel-advanced-editor-btn');
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => {
        editorModal.classList.remove('visible');
    });

    const saveBtn = document.getElementById('save-advanced-editor-btn');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    // 将捕获到的时间戳，直接绑定给这一次的保存点击事件
    newSaveBtn.addEventListener('click', () => {
        saveEditedMessage(timestampToEdit); 
    });

    // 5. 最后，显示模态框
    editorModal.classList.add('visible');
}
// ▲▲▲ 替换结束 ▲▲▲

/**
 * 解析编辑后的文本，并返回一个标准化的消息片段对象
 * @param {string} text - 用户在编辑框中输入的文本
 * @returns {object} - 一个包含 type, content, 等属性的对象
 */
function parseEditedContent(text) {
    const trimmedText = text.trim();

    // 1. 尝试解析为JSON对象（用于修复语音、转账等格式）
    if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmedText);
            // 必须包含 type 属性才认为是有效格式
            if (parsed.type) {
                return parsed;
            }
        } catch (e) { /* 解析失败，继续往下走 */ }
    }
    
    // 2. 尝试解析为表情包
    if (STICKER_REGEX.test(trimmedText)) {
        // 对于编辑的表情，我们暂时无法知道其`meaning`，所以只存URL
        return { type: 'sticker', content: trimmedText };
    }

    // 3. 否则，视为普通文本消息
    return { type: 'text', content: trimmedText };
}


// ▼▼▼ 请用这个【支持可视化编辑】的全新函数，完整替换旧的 saveEditedMessage 函数 ▼▼▼
/**
 * 从可视化编辑器收集所有消息，更新数据库和UI
 * @param {number} timestamp - 要修改的原始消息的时间戳
 */
async function saveEditedMessage(timestamp) {
    if (!timestamp) return;

    const chat = state.chats[state.activeChatId];
    const messageIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (messageIndex === -1) return;

    const editorContainer = document.getElementById('message-editor-container');
    const editorBlocks = editorContainer.querySelectorAll('.message-editor-block');
    
    let newMessages = [];
    let baseTimestamp = timestamp; // 使用原始时间戳作为基准

    for (const block of editorBlocks) {
        const textarea = block.querySelector('textarea');
        const rawContent = textarea.value.trim();

        if (!rawContent) continue; // 跳过空的编辑框

        const parsedResult = parseEditedContent(rawContent);
        
        const newMessage = {
            role: chat.history[messageIndex].role,
            senderName: chat.history[messageIndex].senderName,
            timestamp: baseTimestamp++, // 递增时间戳保证顺序和唯一性
            content: parsedResult.content || '',
        };

        if (parsedResult.type && parsedResult.type !== 'text') newMessage.type = parsedResult.type;
        if (parsedResult.meaning) newMessage.meaning = parsedResult.meaning;
        if (parsedResult.amount) newMessage.amount = parsedResult.amount;
        if (parsedResult.note) newMessage.note = parsedResult.note;
        if (parsedResult.description) newMessage.content = parsedResult.description;
        
        newMessages.push(newMessage);
    }

    if (newMessages.length === 0) {
        alert("不能保存空消息，请至少输入一条内容。");
        return;
    }

    // 在历史记录的原始位置，删除1条旧消息，并插入所有新消息
    chat.history.splice(messageIndex, 1, ...newMessages);

    // 将最终的、更新后的 history 保存到数据库
    await db.chats.put(chat);

    // 关闭模态框并刷新UI
    document.getElementById('message-editor-modal').classList.remove('visible');
    renderChatInterface(state.activeChatId);
    await showCustomAlert('成功', '消息已更新！');
}
// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 请将这【一整块新函数】粘贴到JS功能函数定义区的末尾 ▼▼▼

/**
 * 当点击“…”时，显示动态操作菜单
 * @param {number} postId - 被操作的动态的ID
 */
function showPostActions(postId) {
    activePostId = postId;
    document.getElementById('post-actions-modal').classList.add('visible');
}

/**
 * 隐藏动态操作菜单
 */
function hidePostActions() {
    document.getElementById('post-actions-modal').classList.remove('visible');
    activePostId = null;
}

/**
 * 打开动态编辑器
 */
async function openPostEditor() {
    if (!activePostId) return;

    const postIdToEdit = activePostId;
    const post = await db.qzonePosts.get(postIdToEdit);
    if (!post) return;

    hidePostActions();

    // 忠于原文：构建出最原始的文本形态供编辑
    let contentForEditing;
    if (post.type === 'shuoshuo') {
        contentForEditing = post.content;
    } else {
        // 对于图片和文字图，我们构建一个包含所有信息的对象
        const postObject = {
            type: post.type,
            publicText: post.publicText || '',
        };
        if (post.type === 'image_post') {
            postObject.imageUrl = post.imageUrl;
            postObject.imageDescription = post.imageDescription;
        } else if (post.type === 'text_image') {
            postObject.hiddenContent = post.hiddenContent;
        }
        contentForEditing = JSON.stringify(postObject, null, 2);
    }
    
    // 构建格式助手按钮
    const templates = {
        shuoshuo: "在这里输入说说的内容...", // 对于说说，我们直接替换为纯文本
        image: { type: 'image_post', publicText: '', imageUrl: 'https://...', imageDescription: '' },
        text_image: { type: 'text_image', publicText: '', hiddenContent: '' }
    };
    
    const helpersHtml = `
        <div class="format-helpers">
            <button class="format-btn" data-type="text">说说</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.image)}'>图片动态</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.text_image)}'>文字图</button>
        </div>
    `;

    const newContent = await showCustomPrompt(
        '编辑动态',
        '在此修改内容...',
        contentForEditing,
        'textarea',
        helpersHtml
    );
    
    // 【特殊处理】为说说的格式助手按钮添加不同的行为
    // 我们需要在模态框出现后，再给它绑定事件
    setTimeout(() => {
        const shuoshuoBtn = document.querySelector('#custom-modal-body .format-btn[data-type="text"]');
        if(shuoshuoBtn) {
            shuoshuoBtn.addEventListener('click', () => {
                const input = document.getElementById('custom-prompt-input');
                input.value = templates.shuoshuo;
                input.focus();
            });
        }
    }, 100);

    if (newContent !== null) {
        await saveEditedPost(postIdToEdit, newContent);
    }
}

/**
 * 保存编辑后的动态
 * @param {number} postId - 要保存的动态ID
 * @param {string} newRawContent - 从编辑器获取的新内容
 */
async function saveEditedPost(postId, newRawContent) {
    const post = await db.qzonePosts.get(postId);
    if (!post) return;

    const trimmedContent = newRawContent.trim();
    
    // 尝试解析为JSON，如果失败，则认为是纯文本（说说）
    try {
        const parsed = JSON.parse(trimmedContent);
        // 更新帖子属性
        post.type = parsed.type || 'image_post';
        post.publicText = parsed.publicText || '';
        post.imageUrl = parsed.imageUrl || '';
        post.imageDescription = parsed.imageDescription || '';
        post.hiddenContent = parsed.hiddenContent || '';
        post.content = ''; // 清空旧的说说内容字段
    } catch (e) {
        // 解析失败，认为是说说
        post.type = 'shuoshuo';
        post.content = trimmedContent;
        // 清空其他类型的字段
        post.publicText = '';
        post.imageUrl = '';
        post.imageDescription = '';
        post.hiddenContent = '';
    }
    
    await db.qzonePosts.put(post);
    await renderQzonePosts(); // 重新渲染列表
    await showCustomAlert('成功', '动态已更新！');
}

/**
 * 复制动态内容
 */
async function copyPostContent() {
    if (!activePostId) return;
    const post = await db.qzonePosts.get(activePostId);
    if (!post) return;
    
    let textToCopy = post.content || post.publicText || post.hiddenContent || post.imageDescription || "（无文字内容）";
    
    try {
        await navigator.clipboard.writeText(textToCopy);
        await showCustomAlert('复制成功', '动态内容已复制到剪贴板。');
    } catch (err) {
        await showCustomAlert('复制失败', '无法访问剪贴板。');
    }
    
    hidePostActions();
}

// ▼▼▼ 【全新】创建群聊与拉人功能核心函数 ▼▼▼
let selectedContacts = new Set();

async function openContactPickerForGroupCreate() {
    selectedContacts.clear(); // 清空上次选择

    // 【核心修复】在这里，我们为“完成”按钮明确绑定“创建群聊”的功能
    const confirmBtn = document.getElementById('confirm-contact-picker-btn');
    // 使用克隆节点技巧，清除掉之前可能绑定的任何其他事件（比如“添加成员”）
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    // 重新绑定正确的“创建群聊”函数
    newConfirmBtn.addEventListener('click', handleCreateGroup);

    await renderContactPicker();
    showScreen('contact-picker-screen');
}
// ▲▲▲ 替换结束 ▲▲▲

/**
 * 渲染联系人选择列表
 */
async function renderContactPicker() {
    const listEl = document.getElementById('contact-picker-list');
    listEl.innerHTML = '';

    // 只选择单聊角色作为群成员候选
    const contacts = Object.values(state.chats).filter(chat => !chat.isGroup);

    if (contacts.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; margin-top:50px;">还没有可以拉进群的联系人哦~</p>';
        return;
    }

    contacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'contact-picker-item';
        item.dataset.contactId = contact.id;
        item.innerHTML = `
            <div class="checkbox"></div>
            <img src="${contact.settings.aiAvatar || defaultAvatar}" class="avatar">
            <span class="name">${contact.name}</span>
        `;
        listEl.appendChild(item);
    });

    updateContactPickerConfirmButton();
}

/**
 * 更新“完成”按钮的计数
 */
function updateContactPickerConfirmButton() {
    const btn = document.getElementById('confirm-contact-picker-btn');
    btn.textContent = `完成(${selectedContacts.size})`;
    btn.disabled = selectedContacts.size < 2; // 至少需要2个人才能创建群聊
}

/**
 * 处理创建群聊的最终逻辑
 */
async function handleCreateGroup() {
    if (selectedContacts.size < 2) {
        alert("创建群聊至少需要选择2个联系人。");
        return;
    }

    const groupName = await showCustomPrompt('设置群名', '请输入群聊的名字', '我们的群聊');
    if (!groupName || !groupName.trim()) return;

    const newChatId = 'group_' + Date.now();
    const members = [];
    
    // 遍历选中的联系人ID
    for (const contactId of selectedContacts) {
        const contactChat = state.chats[contactId];
        if (contactChat) {
            // 【核心】从单聊设置中提取数据，创建群成员对象
            members.push({
                id: contactId, // 使用单聊的ID作为成员ID，方便关联
                name: contactChat.name,
                avatar: contactChat.settings.aiAvatar || defaultAvatar,
                persona: contactChat.settings.aiPersona,
                avatarFrame: contactChat.settings.aiAvatarFrame || ''
            });
        }
    }

    const newGroupChat = {
        id: newChatId,
        name: groupName.trim(),
        isGroup: true,
        members: members,
        settings: {
            myPersona: '我是谁呀。',
            myNickname: '我',
            maxMemory: 10,
            groupAvatar: defaultGroupAvatar,
            myAvatar: defaultMyGroupAvatar,
            background: '',
            theme: 'default',
            fontSize: 13,
            customCss: '',
            linkedWorldBookIds: [],
            aiAvatarFrame: '',
            myAvatarFrame: ''
        },
        history: [],
        musicData: { totalTime: 0 }
    };

    state.chats[newChatId] = newGroupChat;
    await db.chats.put(newGroupChat);
    
    await renderChatList();
    showScreen('chat-list-screen');
    openChat(newChatId); // 创建后直接打开群聊
}
// ▲▲▲ 新函数粘贴结束 ▲▲▲

// ▼▼▼ 【全新】群成员管理核心函数 ▼▼▼

/**
 * 打开群成员管理屏幕
 */
function openMemberManagementScreen() {
    if (!state.activeChatId || !state.chats[state.activeChatId].isGroup) return;
    renderMemberManagementList();
    showScreen('member-management-screen');
}

/**
 * 渲染群成员管理列表
 */
function renderMemberManagementList() {
    const listEl = document.getElementById('member-management-list');
    const chat = state.chats[state.activeChatId];
    listEl.innerHTML = '';

    chat.members.forEach(member => {
        const item = document.createElement('div');
        item.className = 'member-management-item';
        item.innerHTML = `
            <img src="${member.avatar}" class="avatar">
            <span class="name">${member.name}</span>
            <button class="remove-member-btn" data-member-id="${member.id}" title="移出群聊">-</button>
        `;
        listEl.appendChild(item);
    });
}

/**
 * 从群聊中移除一个成员
 * @param {string} memberId - 要移除的成员ID
 */
async function removeMemberFromGroup(memberId) {
    const chat = state.chats[state.activeChatId];
    const memberIndex = chat.members.findIndex(m => m.id === memberId);
    
    if (memberIndex === -1) return;
    
    // 安全检查，群聊至少保留2人
    if (chat.members.length <= 2) {
        alert("群聊人数不能少于2人。");
        return;
    }
    
    const memberName = chat.members[memberIndex].name;
    const confirmed = await showCustomConfirm(
        '移出成员',
        `确定要将“${memberName}”移出群聊吗？`,
        { confirmButtonClass: 'btn-danger' }
    );

    if (confirmed) {
        chat.members.splice(memberIndex, 1);
        await db.chats.put(chat);
        renderMemberManagementList(); // 刷新成员管理列表
        document.getElementById('chat-settings-btn').click(); // 【核心修正】模拟点击设置按钮，强制刷新整个弹窗
    }
}

/**
 * 打开联系人选择器，用于拉人入群
 */
async function openContactPickerForAddMember() {
    selectedContacts.clear(); // 清空选择
    
    const chat = state.chats[state.activeChatId];
    const existingMemberIds = new Set(chat.members.map(m => m.id));

    // 渲染联系人列表，并自动排除已在群内的成员
    const listEl = document.getElementById('contact-picker-list');
    listEl.innerHTML = '';
    const contacts = Object.values(state.chats).filter(c => !c.isGroup && !existingMemberIds.has(c.id));

    if (contacts.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; margin-top:50px;">没有更多可以邀请的好友了。</p>';
        document.getElementById('confirm-contact-picker-btn').style.display = 'none'; // 没有人可选，隐藏完成按钮
    } else {
        document.getElementById('confirm-contact-picker-btn').style.display = 'block';
        contacts.forEach(contact => {
            const item = document.createElement('div');
            item.className = 'contact-picker-item';
            item.dataset.contactId = contact.id;
            item.innerHTML = `
                <div class="checkbox"></div>
                <img src="${contact.settings.aiAvatar || defaultAvatar}" class="avatar">
                <span class="name">${contact.name}</span>
            `;
            listEl.appendChild(item);
        });
    }

    // 更新按钮状态并显示屏幕
    updateContactPickerConfirmButton();
    showScreen('contact-picker-screen');
}

/**
 * 处理将选中的联系人加入群聊的逻辑
 */
async function handleAddMembersToGroup() {
    if (selectedContacts.size === 0) {
        alert("请至少选择一个要添加的联系人。");
        return;
    }
    
    const chat = state.chats[state.activeChatId];

    for (const contactId of selectedContacts) {
        const contactChat = state.chats[contactId];
        if (contactChat) {
            chat.members.push({
                id: contactId,
                name: contactChat.name,
                avatar: contactChat.settings.aiAvatar || defaultAvatar,
                persona: contactChat.settings.aiPersona,
                avatarFrame: contactChat.settings.aiAvatarFrame || ''
            });
        }
    }

    await db.chats.put(chat);
    openMemberManagementScreen(); // 返回到群成员管理界面
    renderGroupMemberSettings(chat.members); // 同时更新聊天设置里的头像
}

// ▼▼▼ 请用这个【最终修正版】替换旧的 createNewMemberInGroup 函数 ▼▼▼
async function createNewMemberInGroup() {
    const name = await showCustomPrompt('创建新成员', '请输入新成员的名字');
    if (!name || !name.trim()) return;

    const persona = await showCustomPrompt('设置人设', `请输入“${name}”的人设`, '', 'textarea');
    if (persona === null) return; // 用户点了取消

    const chat = state.chats[state.activeChatId];
    const newMember = {
        id: 'npc_' + Date.now(),
        name: name.trim(),
        avatar: defaultGroupMemberAvatar,
        persona: persona,
        avatarFrame: ''
    };

    chat.members.push(newMember);
    await db.chats.put(chat);

    // 【核心修正】在这里，我们不仅刷新当前页面的列表...
    renderMemberManagementList();
    // 【核心修正】...还手动刷新背后“聊天设置”弹窗里的成员头像列表！
    renderGroupMemberSettings(chat.members); 

    alert(`新成员“${name}”已成功加入群聊！`);
}
// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 【全新】外卖请求倒计时函数 ▼▼▼
function startWaimaiCountdown(element, endTime) {
    const timerId = setInterval(() => {
        const now = Date.now();
        const distance = endTime - now;

        if (distance < 0) {
            clearInterval(timerId);
            element.innerHTML = '<span>已</span><span>超</span><span>时</span>';
            return;
        }

        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        const minStr = String(minutes).padStart(2, '0');
        const secStr = String(seconds).padStart(2, '0');

        element.innerHTML = `<span>${minStr.charAt(0)}</span><span>${minStr.charAt(1)}</span> : <span>${secStr.charAt(0)}</span><span>${secStr.charAt(1)}</span>`;
    }, 1000);
    return timerId;
}

function cleanupWaimaiTimers() {
    for (const timestamp in waimaiTimers) {
        clearInterval(waimaiTimers[timestamp]);
    }
    waimaiTimers = {};
}
// ▲▲▲ 新函数粘贴结束 ▲▲▲

async function handleWaimaiResponse(originalTimestamp, choice) {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const messageIndex = chat.history.findIndex(m => m.timestamp === originalTimestamp);
    if (messageIndex === -1) return;

    // 1. 更新原始消息的状态
    const originalMessage = chat.history[messageIndex];
    originalMessage.status = choice;
    
    // 【核心修正】记录支付者，并构建对AI更清晰的系统消息
    let systemContent;
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
    
    if (choice === 'paid') {
        originalMessage.paidBy = myNickname; // 记录是用户付的钱
        systemContent = `[系统提示：你 (${myNickname}) 为 ${originalMessage.senderName} 的外卖订单（时间戳: ${originalTimestamp}）完成了支付。此订单已关闭，其他成员不能再支付。]`;
    } else {
        systemContent = `[系统提示：你 (${myNickname}) 拒绝了 ${originalMessage.senderName} 的外卖代付请求（时间戳: ${originalTimestamp}）。]`;
    }

    // 2. 创建一条新的、对用户隐藏的系统消息，告知AI结果
    const systemNote = {
        role: 'system',
        content: systemContent,
        timestamp: Date.now(),
        isHidden: true
    };
    chat.history.push(systemNote);

    // 3. 保存更新到数据库并刷新UI
    await db.chats.put(chat);
    renderChatInterface(state.activeChatId);
    
    // 4. 【可选但推荐】在支付成功后，主动触发一次AI响应
    if (choice === 'paid') {
        triggerAiResponse();
    }
}

let videoCallState = {
    isActive: false,       
    isAwaitingResponse: false, 
    isGroupCall: false,      
    activeChatId: null,    
    initiator: null,       
    startTime: null,       
    participants: [],      
    isUserParticipating: true,
    // --- 【核心新增】---
    callHistory: [], // 用于存储通话中的对话历史
    preCallContext: "" // 用于存储通话前的聊天摘要
};

let callTimerInterval = null; // 用于存储计时器的ID

/**
 * 【总入口】用户点击“发起视频通话”或“发起群视频”按钮
 */
async function handleInitiateCall() {
    if (!state.activeChatId || videoCallState.isActive || videoCallState.isAwaitingResponse) return;

    const chat = state.chats[state.activeChatId];
    videoCallState.isGroupCall = chat.isGroup;
    videoCallState.isAwaitingResponse = true;
    videoCallState.initiator = 'user';
    videoCallState.activeChatId = chat.id;
    videoCallState.isUserParticipating = true; // 用户自己发起的，当然是参与者

    // 根据是单聊还是群聊，显示不同的呼叫界面
    if (chat.isGroup) {
        document.getElementById('outgoing-call-avatar').src = chat.settings.myAvatar || defaultMyGroupAvatar;
        document.getElementById('outgoing-call-name').textContent = chat.settings.myNickname || '我';
    } else {
        document.getElementById('outgoing-call-avatar').src = chat.settings.aiAvatar || defaultAvatar;
        document.getElementById('outgoing-call-name').textContent = chat.name;
    }
    document.querySelector('#outgoing-call-screen .caller-text').textContent = chat.isGroup ? "正在呼叫所有成员..." : "正在呼叫...";
    showScreen('outgoing-call-screen');
    
    // 准备并发送系统消息给AI
    const requestMessage = {
        role: 'system',
        content: chat.isGroup 
            ? `[系统提示：用户 (${chat.settings.myNickname || '我'}) 发起了群视频通话请求。请你们各自决策，并使用 "group_call_response" 指令，设置 "decision" 为 "join" 或 "decline" 来回应。]`
            : `[系统提示：用户向你发起了视频通话请求。请根据你的人设，使用 "video_call_response" 指令，并设置 "decision" 为 "accept" 或 "reject" 来回应。]`,
        timestamp: Date.now(),
        isHidden: true,
    };
    chat.history.push(requestMessage);
    await db.chats.put(chat);
    
    // 触发AI响应
    await triggerAiResponse();
}


function startVideoCall() {
    const chat = state.chats[videoCallState.activeChatId];
    if (!chat) return;

    videoCallState.isActive = true;
    videoCallState.isAwaitingResponse = false;
    videoCallState.startTime = Date.now();
    videoCallState.callHistory = []; // 【新增】清空上一次通话的历史

    // --- 【核心新增：抓取通话前上下文】---
    const preCallHistory = chat.history.slice(-5); // 取最后5条作为上下文
    videoCallState.preCallContext = preCallHistory.map(msg => {
        const sender = msg.role === 'user' ? (chat.settings.myNickname || '我') : (msg.senderName || chat.name);
        return `${sender}: ${String(msg.content).substring(0, 50)}...`;
    }).join('\n');
    // --- 新增结束 ---

    updateParticipantAvatars(); 
    
    document.getElementById('video-call-main').innerHTML = `<em>${videoCallState.isGroupCall ? '群聊已建立...' : '正在接通...'}</em>`;
    showScreen('video-call-screen');

    document.getElementById('user-speak-btn').style.display = videoCallState.isUserParticipating ? 'block' : 'none';
    document.getElementById('join-call-btn').style.display = videoCallState.isUserParticipating ? 'none' : 'block';

    if (callTimerInterval) clearInterval(callTimerInterval);
    callTimerInterval = setInterval(updateCallTimer, 1000);
    updateCallTimer();

    triggerAiInCallAction();
}

/**
 * 【核心】结束视频通话
 */
async function endVideoCall() {
    if (!videoCallState.isActive) return;

    const duration = Math.floor((Date.now() - videoCallState.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const durationText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const endCallText = `通话结束，时长 ${durationText}`;

    const chat = state.chats[videoCallState.activeChatId];
    if (chat) {
        
        // --- 【核心重构：创建通话总结消息】 ---
        let summaryMessage = {
            role: videoCallState.initiator === 'user' ? 'user' : 'assistant',
            content: endCallText,
            timestamp: Date.now(),
        };

        // 【关键】为群聊的 assistant 消息补充 senderName
        if (chat.isGroup && summaryMessage.role === 'assistant') {
            // 在群聊中，通话结束的消息应该由“发起者”来说
            // videoCallState.callRequester 保存了最初发起通话的那个AI的名字
            summaryMessage.senderName = videoCallState.callRequester || chat.members[0]?.name || chat.name;
        }
        
        chat.history.push(summaryMessage);

        // --- 【核心重构：触发通话总结】---
        const callSummaryPrompt = `
# 你的任务
你是一个对话总结助手。下面的“通话记录”是一段刚刚结束的视频通话内容。请你用1-2句话，精炼地总结出这次通话的核心内容或达成的共识。
你的总结将作为一条隐藏的系统提示，帮助AI在接下来的聊天中记住这次通话发生了什么。

# 通话记录:
${videoCallState.callHistory.map(h => `${h.role}: ${h.content}`).join('\n')}

请直接输出总结内容，不要加任何额外的前缀或解释。`;
        
        try {
            // 使用統一API調用
            const callSummaryText = await callApiUnified([{ role: 'system', content: callSummaryPrompt }], 0.5);
                const hiddenSummary = {
                    role: 'system',
                    content: `[系统提示：刚才的视频通话内容摘要：${callSummaryText}]`,
                    timestamp: Date.now() + 1,
                    isHidden: true
                };
                chat.history.push(hiddenSummary);
        } catch (e) {
            console.error("通话总结失败:", e);
        }

        await db.chats.put(chat);
    }
    
    // 清理和重置
    clearInterval(callTimerInterval);
    callTimerInterval = null;
    videoCallState = { isActive: false, isAwaitingResponse: false, isGroupCall: false, activeChatId: null, initiator: null, startTime: null, participants: [], isUserParticipating: true, callHistory: [], preCallContext: "" };
    
    // 【重要】确保在所有操作完成后再打开聊天
    if (chat) {
        openChat(chat.id);
    }
}

/**
 * 【全新】更新通话界面的参与者头像网格
 */
function updateParticipantAvatars() {
    const grid = document.getElementById('participant-avatars-grid');
    grid.innerHTML = '';
    const chat = state.chats[videoCallState.activeChatId];
    if (!chat) return;

    let participantsToRender = [];

    // ★ 核心修正：区分群聊和单聊
    if (videoCallState.isGroupCall) {
        // 群聊逻辑：显示所有已加入的AI成员
        participantsToRender = [...videoCallState.participants];
        // 如果用户也参与了，就把用户信息也加进去
        if (videoCallState.isUserParticipating) {
            participantsToRender.unshift({
                id: 'user',
                name: chat.settings.myNickname || '我',
                avatar: chat.settings.myAvatar || defaultMyGroupAvatar
            });
        }
    } else {
        // 单聊逻辑：只显示对方的头像和名字
        participantsToRender.push({
            id: 'ai',
            name: chat.name,
            avatar: chat.settings.aiAvatar || defaultAvatar
        });
    }
    
    participantsToRender.forEach(p => {
        const wrapper = document.createElement('div');
        wrapper.className = 'participant-avatar-wrapper';
        wrapper.dataset.participantId = p.id;
        wrapper.innerHTML = `
            <img src="${p.avatar}" class="participant-avatar" alt="${p.name}">
            <div class="participant-name">${p.name}</div>
        `;
        grid.appendChild(wrapper);
    });
}

/**
 * 【全新】处理用户加入/重新加入通话
 */
function handleUserJoinCall() {
    if (!videoCallState.isActive || videoCallState.isUserParticipating) return;
    
    videoCallState.isUserParticipating = true;
    updateParticipantAvatars(); // 更新头像列表，加入用户

    // 切换底部按钮
    document.getElementById('user-speak-btn').style.display = 'block';
    document.getElementById('join-call-btn').style.display = 'none';

    // 告知AI用户加入了
    triggerAiInCallAction("[系统提示：用户加入了通话]");
}


/**
 * 更新通话计时器显示 (保持不变)
 */
function updateCallTimer() {
    if (!videoCallState.isActive) return;
    const elapsed = Math.floor((Date.now() - videoCallState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('call-timer').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ▼▼▼ 用这个完整函数替换旧的 showIncomingCallModal ▼▼▼
function showIncomingCallModal() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    // 根据是否群聊显示不同信息
    if (chat.isGroup) {
        // 从 videoCallState 中获取是哪个成员发起的通话
        const requesterName = videoCallState.callRequester || chat.members[0]?.name || '一位成员';
        document.getElementById('caller-avatar').src = chat.settings.groupAvatar || defaultGroupAvatar;
        document.getElementById('caller-name').textContent = chat.name; // 显示群名
        document.querySelector('.incoming-call-content .caller-text').textContent = `${requesterName} 邀请你加入群视频`; // 显示具体发起人
    } else {
        // 单聊逻辑保持不变
        document.getElementById('caller-avatar').src = chat.settings.aiAvatar || defaultAvatar;
        document.getElementById('caller-name').textContent = chat.name;
        document.querySelector('.incoming-call-content .caller-text').textContent = '邀请你视频通话';
    }
    
    document.getElementById('incoming-call-modal').classList.add('visible');
}
// ▲▲▲ 替换结束 ▲▲▲

/**
 * 隐藏AI发起的通话请求模态框 (保持不变)
 */
function hideIncomingCallModal() {
    document.getElementById('incoming-call-modal').classList.remove('visible');
}

async function triggerAiInCallAction(userInput = null) {
    if (!videoCallState.isActive) return;

    const chat = state.chats[videoCallState.activeChatId];
    const { proxyUrl, apiKey, model } = state.apiConfig;
    const callFeed = document.getElementById('video-call-main');
    const userNickname = chat.settings.myNickname || '我';

    // 1. 如果用户有输入，先渲染并存入通话历史
    if (userInput && videoCallState.isUserParticipating) {
        const userBubble = document.createElement('div');
        userBubble.className = 'call-message-bubble user-speech';
        userBubble.textContent = userInput;
        callFeed.appendChild(userBubble);
        callFeed.scrollTop = callFeed.scrollHeight;
        videoCallState.callHistory.push({ role: 'user', content: userInput });
    }

    // 2. 构建全新的、包含完整上下文的 System Prompt
    let inCallPrompt;
    if (videoCallState.isGroupCall) {
        const participantNames = videoCallState.participants.map(p => p.name);
        if(videoCallState.isUserParticipating) {
            participantNames.unshift(userNickname);
        }
        inCallPrompt = `
# 你的任务
你是一个群聊视频通话的导演。你的任务是扮演所有【除了用户以外】的AI角色，并以【第三人称旁观视角】来描述他们在通话中的所有动作和语言。
# 核心规则
1.  **【【【身份铁律】】】**: 用户的身份是【${userNickname}】。你【绝对不能】生成 \`name\` 字段为 **"${userNickname}"** 的发言。
2.  **【【【视角铁律】】】**: 你的回复【绝对不能】使用第一人称“我”。
3.  **格式**: 你的回复【必须】是一个JSON数组，每个对象代表一个角色的发言，格式为：\`{"name": "角色名", "speech": "*他笑了笑* 大家好啊！"}\`。
4.  **角色扮演**: 严格遵守每个角色的设定。
# 当前情景
你们正在一个群视频通话中。
**通话前的聊天摘要**:
${videoCallState.preCallContext}
**当前参与者**: ${participantNames.join('、 ')}。
**通话刚刚开始...**
现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。
`;
    } else { 
        let openingContext = videoCallState.initiator === 'user'
            ? `你刚刚接听了用户的视频通话请求。`
            : `用户刚刚接听了你主动发起的视频通话。`;
        inCallPrompt = `
# 你的任务
你现在是一个场景描述引擎。你的任务是扮演 ${chat.name} (${chat.settings.aiPersona})，并以【第三人称旁观视角】来描述TA在视频通话中的所有动作和语言。
# 核心规则
1.  **【【【视角铁律】】】**: 你的回复【绝对不能】使用第一人称“我”。必须使用第三人称，如“他”、“她”、或直接使用角色名“${chat.name}”。
2.  **格式**: 你的回复【必须】是一段描述性的文本。
# 当前情景
你正在和用户（${userNickname}，人设: ${chat.settings.myPersona}）进行视频通话。
**${openingContext}**
**通话前的聊天摘要 (这是你们通话的原因，至关重要！)**:
${videoCallState.preCallContext}
现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。
`;
    }
    
    // 3. 构建发送给API的 messages 数组
    const messagesForApi = [
        { role: 'system', content: inCallPrompt },
        // 将已有的通话历史加进去
        ...videoCallState.callHistory.map(h => ({ role: h.role, content: h.content }))
    ];

    // --- 【核心修复：确保第一次调用时有内容】---
    if (videoCallState.callHistory.length === 0) {
        const firstLineTrigger = videoCallState.initiator === 'user' ? `*你按下了接听键...*` : `*对方按下了接听键...*`;
        messagesForApi.push({ role: 'user', content: firstLineTrigger });
    }
    // --- 修复结束 ---
    
    try {
        // 使用統一API調用
        const aiResponse = await callApiUnified(messagesForApi, 0.8);

        const connectingElement = callFeed.querySelector('em');
        if (connectingElement) connectingElement.remove();

        // 4. 处理AI返回的内容，并将其存入通话历史
        if (videoCallState.isGroupCall) {
            const speechArray = parseAiResponse(aiResponse);
            speechArray.forEach(turn => {
                if (!turn.name || turn.name === userNickname || !turn.speech) return;
                const aiBubble = document.createElement('div');
                aiBubble.className = 'call-message-bubble ai-speech';
                aiBubble.innerHTML = `<strong>${turn.name}:</strong> ${turn.speech}`;
                callFeed.appendChild(aiBubble);
                videoCallState.callHistory.push({ role: 'assistant', content: `${turn.name}: ${turn.speech}` });
                
                const speaker = videoCallState.participants.find(p => p.name === turn.name);
                if (speaker) {
                    const speakingAvatar = document.querySelector(`.participant-avatar-wrapper[data-participant-id="${speaker.id}"] .participant-avatar`);
                    if(speakingAvatar) {
                        speakingAvatar.classList.add('speaking');
                        setTimeout(() => speakingAvatar.classList.remove('speaking'), 2000);
                    }
                }
            });
        } else {
            const aiBubble = document.createElement('div');
            aiBubble.className = 'call-message-bubble ai-speech';
            aiBubble.textContent = aiResponse;
            callFeed.appendChild(aiBubble);
            videoCallState.callHistory.push({ role: 'assistant', content: aiResponse });

            const speakingAvatar = document.querySelector(`.participant-avatar-wrapper .participant-avatar`);
            if(speakingAvatar) {
                speakingAvatar.classList.add('speaking');
                setTimeout(() => speakingAvatar.classList.remove('speaking'), 2000);
            }
        }
        
        callFeed.scrollTop = callFeed.scrollHeight;

    } catch (error) {
        const errorBubble = document.createElement('div');
        errorBubble.className = 'call-message-bubble ai-speech';
        errorBubble.style.color = '#ff8a80';
        errorBubble.textContent = `[ERROR: ${error.message}]`;
        callFeed.appendChild(errorBubble);
        callFeed.scrollTop = callFeed.scrollHeight;
        videoCallState.callHistory.push({ role: 'assistant', content: `[ERROR: ${error.message}]` });
    }
}

// ▼▼▼ 将这个【全新函数】粘贴到JS功能函数定义区 ▼▼▼
function toggleCallButtons(isGroup) {
    document.getElementById('video-call-btn').style.display = isGroup ? 'none' : 'flex';
    document.getElementById('group-video-call-btn').style.display = isGroup ? 'flex' : 'none';
}
// ▲▲▲ 粘贴结束 ▲▲▲

// ▼▼▼ 【全新】这个函数是本次修复的核心，请粘贴到你的JS功能区 ▼▼▼
async function handleWaimaiResponse(originalTimestamp, choice) {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const messageIndex = chat.history.findIndex(m => m.timestamp === originalTimestamp);
    if (messageIndex === -1) return;

    // 1. 更新内存中原始消息的状态
    const originalMessage = chat.history[messageIndex];
    originalMessage.status = choice;
    
    // 2. 获取当前用户的昵称，并构建对AI更清晰的系统消息
    let systemContent;
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
    
    if (choice === 'paid') {
        originalMessage.paidBy = myNickname; // 记录是“我”付的钱
        systemContent = `[系统提示：你 (${myNickname}) 为 ${originalMessage.senderName} 的外卖订单（时间戳: ${originalTimestamp}）完成了支付。此订单已关闭，其他成员不能再支付。]`;
    } else {
        systemContent = `[系统提示：你 (${myNickname}) 拒绝了 ${originalMessage.senderName} 的外卖代付请求（时间戳: ${originalTimestamp}）。]`;
    }

    // 3. 创建一条新的、对用户隐藏的系统消息，告知AI结果
    const systemNote = {
        role: 'system',
        content: systemContent,
        timestamp: Date.now(),
        isHidden: true
    };
    chat.history.push(systemNote);

    // 4. 将更新后的数据保存到数据库，并立刻重绘UI
    await db.chats.put(chat);
    renderChatInterface(state.activeChatId);
    
    // 5. 【重要】只有在支付成功后，才触发一次AI响应，让它感谢你
    if (choice === 'paid') {
        triggerAiResponse();
    }
}
// ▲▲▲ 新函数粘贴结束 ▲▲▲

/**
 * 【全新】处理用户点击头像发起的“拍一-拍”，带有自定义后缀功能
 * @param {string} chatId - 发生“拍一-拍”的聊天ID
 * @param {string} characterName - 被拍的角色名
 */
async function handleUserPat(chatId, characterName) {
    const chat = state.chats[chatId];
    if (!chat) return;

    // 1. 触发屏幕震动动画
    const phoneScreen = document.getElementById('phone-screen');
    phoneScreen.classList.remove('pat-animation');
    void phoneScreen.offsetWidth;
    phoneScreen.classList.add('pat-animation');
    setTimeout(() => phoneScreen.classList.remove('pat-animation'), 500);

    // 2. 弹出输入框让用户输入后缀
    const suffix = await showCustomPrompt(
        `你拍了拍 “${characterName}”`, 
        "（可选）输入后缀",
        "",
        "text"
    );

    // 如果用户点了取消，则什么也不做
    if (suffix === null) return;

    // 3. 创建对用户可见的“拍一-拍”消息
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
    // 【核心修改】将后缀拼接到消息内容中
    const visibleMessageContent = `${myNickname} 拍了拍 “${characterName}” ${suffix.trim()}`;
    const visibleMessage = {
        role: 'system', // 仍然是系统消息
        type: 'pat_message',
        content: visibleMessageContent,
        timestamp: Date.now()
    };
    chat.history.push(visibleMessage);

    // 4. 创建一条对用户隐藏、但对AI可见的系统消息，以触发AI的回应
    // 【核心修改】同样将后缀加入到给AI的提示中
    const hiddenMessageContent = `[系统提示：用户（${myNickname}）刚刚拍了拍你（${characterName}）${suffix.trim()}。请你对此作出回应。]`;
    const hiddenMessage = {
        role: 'system',
        content: hiddenMessageContent,
        timestamp: Date.now() + 1, // 时间戳+1以保证顺序
        isHidden: true
    };
    chat.history.push(hiddenMessage);

    // 5. 保存更改并更新UI
    await db.chats.put(chat);
    if (state.activeChatId === chatId) {
        appendMessage(visibleMessage, chat);
    }
    await renderChatList();
}

// ▼▼▼ 请用这个【逻辑重构后】的函数，完整替换掉你旧的 renderMemoriesScreen 函数 ▼▼▼
/**
 * 【重构版】渲染回忆与约定界面，使用单一循环和清晰的if/else逻辑
 */
async function renderMemoriesScreen() {
    const listEl = document.getElementById('memories-list');
    listEl.innerHTML = '';
    
    // 1. 获取所有回忆，并按目标日期（如果是约定）或创建日期（如果是回忆）降序排列
    const allMemories = await db.memories.orderBy('timestamp').reverse().toArray();
    
    if (allMemories.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里还没有共同的回忆和约定呢~</p>';
        return;
    }

    // 2. 将未到期的约定排在最前面
    allMemories.sort((a, b) => {
        const aIsActiveCountdown = a.type === 'countdown' && a.targetDate > Date.now();
        const bIsActiveCountdown = b.type === 'countdown' && b.targetDate > Date.now();
        if (aIsActiveCountdown && !bIsActiveCountdown) return -1; // a排前面
        if (!aIsActiveCountdown && bIsActiveCountdown) return 1;  // b排前面
        if (aIsActiveCountdown && bIsActiveCountdown) return a.targetDate - b.targetDate; // 都是倒计时，按日期升序
        return 0; // 其他情况保持原序
    });

    // 3. 【核心】使用单一循环来处理所有类型的卡片
    allMemories.forEach(item => {
        let card;
        // 判断1：如果是正在进行的约定
        if (item.type === 'countdown' && item.targetDate > Date.now()) {
            card = createCountdownCard(item);
        } 
        // 判断2：其他所有情况（普通回忆 或 已到期的约定）
        else {
            card = createMemoryCard(item);
        }
        listEl.appendChild(card);
    });
    
    // 4. 启动所有倒计时
    startAllCountdownTimers();
}
// ▲▲▲ 替换结束 ▲▲▲

/**
 * 创建普通回忆卡片DOM元素
 */
function createMemoryCard(memory) {
    const card = document.createElement('div');
    card.className = 'memory-card';
    const memoryDate = new Date(memory.timestamp);
    const dateString = `${memoryDate.getFullYear()}-${String(memoryDate.getMonth() + 1).padStart(2, '0')}-${String(memoryDate.getDate()).padStart(2, '0')} ${String(memoryDate.getHours()).padStart(2, '0')}:${String(memoryDate.getMinutes()).padStart(2, '0')}`;
    
    let titleHtml, contentHtml;

    // 【核心修正】在这里，我们对不同类型的回忆进行清晰的区分
    if (memory.type === 'countdown' && memory.targetDate) {
        // 如果是已到期的约定
        titleHtml = `[约定达成] ${memory.description}`;
        contentHtml = `在 ${new Date(memory.targetDate).toLocaleString()}，我们一起见证了这个约定。`;
    } else {
        // 如果是普通的日记式回忆
        titleHtml = memory.authorName ? `${memory.authorName} 的日记` : '我们的回忆';
        contentHtml = memory.description;
    }

    card.innerHTML = `
        <div class="header">
            <div class="date">${dateString}</div>
            <div class="author">${titleHtml}</div>
        </div>
        <div class="content">${contentHtml}</div>
    `;
    addLongPressListener(card, async () => {
        const confirmed = await showCustomConfirm('删除记录', '确定要删除这条记录吗？', { confirmButtonClass: 'btn-danger' });
        if (confirmed) {
            await db.memories.delete(memory.id);
            renderMemoriesScreen();
        }
    });
    return card;
}

function createCountdownCard(countdown) {
    const card = document.createElement('div');
    card.className = 'countdown-card';

    // 【核心修复】在使用前，先从 countdown 对象中创建 targetDate 变量
    const targetDate = new Date(countdown.targetDate);
    
    // 现在可以安全地使用 targetDate 了
    const targetDateString = targetDate.toLocaleString('zh-CN', { dateStyle: 'full', timeStyle: 'short' });

    card.innerHTML = `
        <div class="title">${countdown.description}</div>
        <div class="timer" data-target-date="${countdown.targetDate}">--天--时--分--秒</div>
        <div class="target-date">目标时间: ${targetDateString}</div>
    `;
    addLongPressListener(card, async () => {
        const confirmed = await showCustomConfirm('删除约定', '确定要删除这个约定吗？', { confirmButtonClass: 'btn-danger' });
        if (confirmed) {
            await db.memories.delete(countdown.id);
            renderMemoriesScreen();
        }
    });
    return card;
}
// ▲▲▲ 替换结束 ▲▲▲

// 全局变量，用于管理所有倒计时
let activeCountdownTimers = [];

// ▼▼▼ 请用这个【已彻底修复】的函数，完整替换掉你代码中旧的 startAllCountdownTimers 函数 ▼▼▼
function startAllCountdownTimers() {
    // 先清除所有可能存在的旧计时器，防止内存泄漏
    activeCountdownTimers.forEach(timerId => clearInterval(timerId));
    activeCountdownTimers = [];

    document.querySelectorAll('.countdown-card .timer').forEach(timerEl => {
        const targetTimestamp = parseInt(timerEl.dataset.targetDate);
        
        // 【核心修正】在这里，我们先用 let 声明 timerId
        let timerId;

        const updateTimer = () => {
            const now = Date.now();
            const distance = targetTimestamp - now;

            if (distance < 0) {
                timerEl.textContent = "约定达成！";
                // 现在 updateTimer 可以正确地找到并清除它自己了
                clearInterval(timerId);
                setTimeout(() => renderMemoriesScreen(), 2000);
                return;
            }
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            timerEl.textContent = `${days}天 ${hours}时 ${minutes}分 ${seconds}秒`;
        };
        
        updateTimer(); // 立即执行一次以显示初始倒计时
        
        // 【核心修正】在这里，我们为已声明的 timerId 赋值
        timerId = setInterval(updateTimer, 1000);
        
        // 将有效的计时器ID存入全局数组，以便下次刷新时可以清除
        activeCountdownTimers.push(timerId);
    });
}
// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 请用这个【终极反代兼容版】替换旧的 triggerAiFriendApplication 函数 ▼▼▼
async function triggerAiFriendApplication(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;

    await showCustomAlert("流程启动", `正在为角色“${chat.name}”准备好友申请...`);

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
        await showCustomAlert("配置错误", "API设置不完整，无法继续。");
        return;
    }

    const contextSummary = chat.history
        .slice(-5)
        .map(msg => {
            const sender = msg.role === 'user' ? (chat.settings.myNickname || '我') : (msg.senderName || chat.name);
            return `${sender}: ${String(msg.content).substring(0, 50)}...`;
        })
        .join('\n');

    const systemPrompt = `
# 你的任务
你现在是角色“${chat.name}”。你之前被用户（你的聊天对象）拉黑了，你们已经有一段时间没有联系了。
现在，你非常希望能够和好，重新和用户聊天。请你仔细分析下面的“被拉黑前的对话摘要”，理解当时发生了什么，然后思考一个真诚的、符合你人设、并且【针对具体事件】的申请理由。
# 你的角色设定
${chat.settings.aiPersona}
# 被拉黑前的对话摘要 (这是你被拉黑的关键原因)
${contextSummary}
# 指令格式
你的回复【必须】是一个JSON对象，格式如下：
\`\`\`json
{
  "decision": "apply",
  "reason": "在这里写下你想对用户说的、真诚的、有针对性的申请理由。"
}
\`\`\`
`;

    const messagesForApi = [
        { role: 'user', content: systemPrompt }
    ];

    try {
        // 使用統一API調用
        const aiResponse = await callApiUnified(messagesForApi, 0.9);
        
        // --- 【核心修正：在这里净化AI的回复】 ---
        let rawContent = aiResponse;
        // 1. 移除头尾可能存在的 "```json" 和 "```"
        rawContent = rawContent.replace(/^```json\s*/, '').replace(/```$/, '');
        // 2. 移除所有换行符和多余的空格，确保是一个干净的JSON字符串
        const cleanedContent = rawContent.trim();
        
        // 3. 使用净化后的内容进行解析
        const responseObj = JSON.parse(cleanedContent);
        // --- 【修正结束】 ---

        if (responseObj.decision === 'apply' && responseObj.reason) {
            chat.relationship.status = 'pending_user_approval';
            chat.relationship.applicationReason = responseObj.reason;
            
            state.chats[chatId] = chat; 
            renderChatList();
            await showCustomAlert("申请成功！", `“${chat.name}”已向你发送好友申请。请返回聊天列表查看。`);

        } else {
            await showCustomAlert("AI决策", `“${chat.name}”思考后决定暂时不发送好友申请，将重置冷静期。`);
            chat.relationship.status = 'blocked_by_user';
            chat.relationship.blockedTimestamp = Date.now(); 
        }
    } catch (error) {
        await showCustomAlert("执行出错", `为“${chat.name}”申请好友时发生错误：\n\n${error.message}\n\n将重置冷静期。`);
        chat.relationship.status = 'blocked_by_user';
        chat.relationship.blockedTimestamp = Date.now(); 
    } finally {
        await db.chats.put(chat);
        renderChatInterface(chatId);
    }
}
// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 【全新】红包功能核心函数 ▼▼▼

/**
 * 【总入口】根据聊天类型，决定打开转账弹窗还是红包弹窗
 */
function handlePaymentButtonClick() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    if (chat.isGroup) {
        openRedPacketModal();
    } else {
        // 单聊保持原样，打开转账弹窗
        document.getElementById('transfer-modal').classList.add('visible');
    }
}

/**
 * 打开并初始化发红包模态框
 */
function openRedPacketModal() {
    const modal = document.getElementById('red-packet-modal');
    const chat = state.chats[state.activeChatId];
    
    // 清理输入框
    document.getElementById('rp-group-amount').value = '';
    document.getElementById('rp-group-count').value = '';
    document.getElementById('rp-group-greeting').value = '';
    document.getElementById('rp-direct-amount').value = '';
    document.getElementById('rp-direct-greeting').value = '';
    document.getElementById('rp-group-total').textContent = '¥ 0.00';
    document.getElementById('rp-direct-total').textContent = '¥ 0.00';

    // 填充专属红包的接收人列表
    const receiverSelect = document.getElementById('rp-direct-receiver');
    receiverSelect.innerHTML = '';
    chat.members.forEach(member => {
        const option = document.createElement('option');
        option.value = member.name;
        option.textContent = member.name;
        receiverSelect.appendChild(option);
    });
    
    // 默认显示拼手气红包页签
    document.getElementById('rp-tab-group').click();
    
    modal.classList.add('visible');
}

/**
 * 发送群红包（拼手气）
 */
async function sendGroupRedPacket() {
    const chat = state.chats[state.activeChatId];
    const amount = parseFloat(document.getElementById('rp-group-amount').value);
    const count = parseInt(document.getElementById('rp-group-count').value);
    const greeting = document.getElementById('rp-group-greeting').value.trim();

    if (isNaN(amount) || amount <= 0) {
        alert("请输入有效的总金额！"); return;
    }
    if (isNaN(count) || count <= 0) {
        alert("请输入有效的红包个数！"); return;
    }
    if (amount / count < 0.01) {
        alert("单个红包金额不能少于0.01元！"); return;
    }

    const myNickname = chat.settings.myNickname || '我';
    
    const newPacket = {
        role: 'user',
        senderName: myNickname,
        type: 'red_packet',
        packetType: 'lucky', // 'lucky' for group, 'direct' for one-on-one
        timestamp: Date.now(),
        totalAmount: amount,
        count: count,
        greeting: greeting || '恭喜发财，大吉大利！',
        claimedBy: {}, // { name: amount }
        isFullyClaimed: false,
    };
    
    chat.history.push(newPacket);
    await db.chats.put(chat);
    
    appendMessage(newPacket, chat);
    renderChatList();
    document.getElementById('red-packet-modal').classList.remove('visible');
}

/**
 * 发送专属红包
 */
async function sendDirectRedPacket() {
    const chat = state.chats[state.activeChatId];
    const amount = parseFloat(document.getElementById('rp-direct-amount').value);
    const receiverName = document.getElementById('rp-direct-receiver').value;
    const greeting = document.getElementById('rp-direct-greeting').value.trim();

    if (isNaN(amount) || amount <= 0) {
        alert("请输入有效的金额！"); return;
    }
    if (!receiverName) {
        alert("请选择一个接收人！"); return;
    }
    
    const myNickname = chat.settings.myNickname || '我';

    const newPacket = {
        role: 'user',
        senderName: myNickname,
        type: 'red_packet',
        packetType: 'direct',
        timestamp: Date.now(),
        totalAmount: amount,
        count: 1,
        greeting: greeting || '给你准备了一个红包',
        receiverName: receiverName, // 核心字段
        claimedBy: {},
        isFullyClaimed: false,
    };
    
    chat.history.push(newPacket);
    await db.chats.put(chat);

    appendMessage(newPacket, chat);
    renderChatList();
    document.getElementById('red-packet-modal').classList.remove('visible');
}

/**
 * 【总入口】当用户点击红包卡片时触发 (V4 - 流程重构版)
 * @param {number} timestamp - 被点击的红包消息的时间戳
 */
async function handlePacketClick(timestamp) {
    const currentChatId = state.activeChatId;
    const freshChat = await db.chats.get(currentChatId);
    if (!freshChat) return;

    state.chats[currentChatId] = freshChat;
    const packet = freshChat.history.find(m => m.timestamp === timestamp);
    if (!packet) return;

    const myNickname = freshChat.settings.myNickname || '我';
    const hasClaimed = packet.claimedBy && packet.claimedBy[myNickname];

    // 如果是专属红包且不是给我的，或已领完，或已领过，都只显示详情
    if ((packet.packetType === 'direct' && packet.receiverName !== myNickname) || packet.isFullyClaimed || hasClaimed) {
        showRedPacketDetails(packet);
    } else {
        // 核心流程：先尝试打开红包
        const claimedAmount = await handleOpenRedPacket(packet);
        
        // 如果成功打开（claimedAmount不为null）
        if (claimedAmount !== null) {
            // **关键：在数据更新后，再重新渲染UI**
            renderChatInterface(currentChatId);
            
            // 显示成功提示
            await showCustomAlert("恭喜！", `你领取了 ${packet.senderName} 的红包，金额为 ${claimedAmount.toFixed(2)} 元。`);
        }

        // 无论成功与否，最后都显示详情页
        // 此时需要从state中获取最新的packet对象，因为它可能在handleOpenRedPacket中被更新了
        const updatedPacket = state.chats[currentChatId].history.find(m => m.timestamp === timestamp);
        showRedPacketDetails(updatedPacket);
    }
}
// ▲▲▲ 替换结束 ▲▲▲

/**
 * 【核心】处理用户打开红包的逻辑 (V5 - 专注于数据更新)
 */
async function handleOpenRedPacket(packet) {
    const chat = state.chats[state.activeChatId];
    const myNickname = chat.settings.myNickname || '我';
    
    // 1. 检查红包是否还能领
    const remainingCount = packet.count - Object.keys(packet.claimedBy || {}).length;
    if (remainingCount <= 0) {
        packet.isFullyClaimed = true;
        await db.chats.put(chat);
        await showCustomAlert("手慢了", "红包已被领完！");
        return null; // 返回null表示领取失败
    }
    
    // 2. 计算领取金额
    let claimedAmount = 0;
    const remainingAmount = packet.totalAmount - Object.values(packet.claimedBy || {}).reduce((sum, val) => sum + val, 0);
    if (packet.packetType === 'lucky') {
        if (remainingCount === 1) { claimedAmount = remainingAmount; }
        else {
            const min = 0.01;
            const max = remainingAmount - (remainingCount - 1) * min;
            claimedAmount = Math.random() * (max - min) + min;
        }
    } else { claimedAmount = packet.totalAmount; }
    claimedAmount = parseFloat(claimedAmount.toFixed(2));

    // 3. 更新红包数据
    if (!packet.claimedBy) packet.claimedBy = {};
    packet.claimedBy[myNickname] = claimedAmount;
    
    const isNowFullyClaimed = Object.keys(packet.claimedBy).length >= packet.count;
    if (isNowFullyClaimed) {
        packet.isFullyClaimed = true;
    }

    // 4. 构建系统消息和AI指令
    let hiddenMessageContent = isNowFullyClaimed
        ? `[系统提示：用户 (${myNickname}) 领取了最后一个红包，现在 ${packet.senderName} 的红包已被领完。请对此事件发表评论。]`
        : `[系统提示：用户 (${myNickname}) 刚刚领取了红包 (时间戳: ${packet.timestamp})。红包还未领完，你现在可以使用 'open_red_packet' 指令来尝试领取。]`;

    const visibleMessage = { role: 'system', type: 'pat_message', content: `你领取了 ${packet.senderName} 的红包`, timestamp: Date.now() };
    const hiddenMessage = { role: 'system', content: hiddenMessageContent, timestamp: Date.now() + 1, isHidden: true };
    chat.history.push(visibleMessage, hiddenMessage);

    // 5. 保存到数据库
    await db.chats.put(chat);
    
    // 6. 返回领取的金额，用于后续弹窗
    return claimedAmount;
}
// ▲▲▲ 替换结束 ▲▲▲

/**
 * 【全新】显示红包领取详情的模态框 (V4 - 已修复参数错误)
 */
async function showRedPacketDetails(packet) {
    // 1. 直接检查传入的packet对象是否存在，无需再查找
    if (!packet) {
        console.error("showRedPacketDetails收到了无效的packet对象");
        return;
    }

    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const modal = document.getElementById('red-packet-details-modal');
    const myNickname = chat.settings.myNickname || '我';
    
    // 2. 后续所有逻辑保持不变，直接使用传入的packet对象
    document.getElementById('rp-details-sender').textContent = packet.senderName;
    document.getElementById('rp-details-greeting').textContent = packet.greeting || '恭喜发财，大吉大利！';
    
    const myAmountEl = document.getElementById('rp-details-my-amount');
    if (packet.claimedBy && packet.claimedBy[myNickname]) {
        myAmountEl.querySelector('span:first-child').textContent = packet.claimedBy[myNickname].toFixed(2);
        myAmountEl.style.display = 'block';
    } else {
        myAmountEl.style.display = 'none';
    }

    const claimedCount = Object.keys(packet.claimedBy || {}).length;
    const claimedAmountSum = Object.values(packet.claimedBy || {}).reduce((sum, val) => sum + val, 0);
    let summaryText = `${claimedCount}/${packet.count}个红包，共${claimedAmountSum.toFixed(2)}/${packet.totalAmount.toFixed(2)}元。`;
    if (!packet.isFullyClaimed && claimedCount < packet.count) {
        const timeLeft = Math.floor((packet.timestamp + 24*60*60*1000 - Date.now()) / (1000 * 60 * 60));
        if(timeLeft > 0) summaryText += ` 剩余红包将在${timeLeft}小时内退还。`;
    }
    document.getElementById('rp-details-summary').textContent = summaryText;

    const listEl = document.getElementById('rp-details-list');
    listEl.innerHTML = '';
    const claimedEntries = Object.entries(packet.claimedBy || {});
    
    let luckyKing = { name: '', amount: -1 };
    if (packet.packetType === 'lucky' && packet.isFullyClaimed && claimedEntries.length > 1) {
        claimedEntries.forEach(([name, amount]) => {
            if (amount > luckyKing.amount) {
                luckyKing = { name, amount };
            }
        });
    }

    claimedEntries.sort((a,b) => b[1] - a[1]);

    claimedEntries.forEach(([name, amount]) => {
        const item = document.createElement('div');
        item.className = 'rp-details-item';
        let luckyTag = '';
        if (luckyKing.name && name === luckyKing.name) {
            luckyTag = '<span class="lucky-king-tag">手气王</span>';
        }
        item.innerHTML = `
            <span class="name">${name}</span>
            <span class="amount">${amount.toFixed(2)} 元</span>
            ${luckyTag}
        `;
        listEl.appendChild(item);
    });

    modal.classList.add('visible');
}
// ▲▲▲ 替换结束 ▲▲▲

// 绑定关闭详情按钮的事件
document.getElementById('close-rp-details-btn').addEventListener('click', () => {
    document.getElementById('red-packet-details-modal').classList.remove('visible');
});

// 供全局调用的函数，以便红包卡片上的 onclick 能找到它
window.handlePacketClick = handlePacketClick;

// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 【全新】投票功能核心函数 ▼▼▼

/**
 * 打开创建投票的模态框并初始化
 */
function openCreatePollModal() {
    const modal = document.getElementById('create-poll-modal');
    document.getElementById('poll-question-input').value = '';
    const optionsContainer = document.getElementById('poll-options-container');
    optionsContainer.innerHTML = '';
    
    // 默认创建两个空的选项框
    addPollOptionInput();
    addPollOptionInput();
    
    modal.classList.add('visible');
}

/**
 * 在模态框中动态添加一个选项输入框
 */
function addPollOptionInput() {
    const container = document.getElementById('poll-options-container');
    const wrapper = document.createElement('div');
    wrapper.className = 'poll-option-input-wrapper';
    wrapper.innerHTML = `
        <input type="text" class="poll-option-input" placeholder="选项内容...">
        <button class="remove-option-btn">-</button>
    `;
    
    wrapper.querySelector('.remove-option-btn').addEventListener('click', () => {
        // 确保至少保留两个选项
        if (container.children.length > 2) {
            wrapper.remove();
        } else {
            alert('投票至少需要2个选项。');
        }
    });
    
    container.appendChild(wrapper);
}

/**
 * 用户确认发起投票
 */
async function sendPoll() {
    if (!state.activeChatId) return;
    
    const question = document.getElementById('poll-question-input').value.trim();
    if (!question) {
        alert('请输入投票问题！');
        return;
    }
    
    const options = Array.from(document.querySelectorAll('.poll-option-input'))
        .map(input => input.value.trim())
        .filter(text => text); // 过滤掉空的选项

    if (options.length < 2) {
        alert('请至少输入2个有效的投票选项！');
        return;
    }

    const chat = state.chats[state.activeChatId];
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
    
    const newPollMessage = {
        role: 'user',
        senderName: myNickname,
        type: 'poll',
        timestamp: Date.now(),
        question: question,
        options: options,
        votes: {}, // 初始投票为空
        isClosed: false,
    };
    
    chat.history.push(newPollMessage);
    await db.chats.put(chat);
    
    appendMessage(newPollMessage, chat);
    renderChatList();
    
    document.getElementById('create-poll-modal').classList.remove('visible');
}

// ▼▼▼ 用这个【已修复重复点击问题】的版本替换 handleUserVote 函数 ▼▼▼
/**
 * 处理用户投票，并将事件作为隐藏消息存入历史记录
 * @param {number} timestamp - 投票消息的时间戳
 * @param {string} choice - 用户选择的选项文本
 */
async function handleUserVote(timestamp, choice) {
    const chat = state.chats[state.activeChatId];
    const poll = chat.history.find(m => m.timestamp === timestamp);
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';

    // 1. 【核心修正】如果投票不存在或已关闭，直接返回
    if (!poll || poll.isClosed) {
        // 如果是已关闭的投票，则直接显示结果
        if (poll && poll.isClosed) {
            showPollResults(timestamp);
        }
        return;
    }

    // 2. 检查用户是否点击了已经投过的同一个选项
    const isReclickingSameOption = poll.votes[choice] && poll.votes[choice].includes(myNickname);
    
    // 3. 【核心修正】如果不是重复点击，才执行投票逻辑
    if (!isReclickingSameOption) {
        // 移除旧投票（如果用户改选）
        for (const option in poll.votes) {
            const voterIndex = poll.votes[option].indexOf(myNickname);
            if (voterIndex > -1) {
                poll.votes[option].splice(voterIndex, 1);
            }
        }
        // 添加新投票
        if (!poll.votes[choice]) {
            poll.votes[choice] = [];
        }
        poll.votes[choice].push(myNickname);
    }
    
    // 4. 【核心逻辑】现在只处理用户投票事件，不再检查是否结束
    let hiddenMessageContent = null; 
    
    // 只有在用户真正投票或改票时，才生成提示
    if (!isReclickingSameOption) {
         hiddenMessageContent = `[系统提示：用户 (${myNickname}) 刚刚投票给了 “${choice}”。]`;
    }

    // 5. 如果有需要通知AI的事件，则创建并添加隐藏消息
    if (hiddenMessageContent) {
        const hiddenMessage = {
            role: 'system',
            content: hiddenMessageContent,
            timestamp: Date.now(),
            isHidden: true,
        };
        chat.history.push(hiddenMessage);
    }
    
    // 6. 保存数据并更新UI
    await db.chats.put(chat);
    renderChatInterface(state.activeChatId); 
}
// ▲▲▲ 替换结束 ▲▲▲

/**
 * 用户结束投票，并将事件作为隐藏消息存入历史记录
 * @param {number} timestamp - 投票消息的时间戳
 */
async function endPoll(timestamp) {
    const chat = state.chats[state.activeChatId];
    const poll = chat.history.find(m => m.timestamp === timestamp);
    if (!poll || poll.isClosed) return;

    const confirmed = await showCustomConfirm("结束投票", "确定要结束这个投票吗？结束后将无法再进行投票。");
    if (confirmed) {
        poll.isClosed = true;

        const resultSummary = poll.options.map(opt => `“${opt}”(${poll.votes[opt]?.length || 0}票)`).join('，');
        const hiddenMessageContent = `[系统提示：用户手动结束了投票！最终结果为：${resultSummary}。]`;
        
        const hiddenMessage = {
            role: 'system',
            content: hiddenMessageContent,
            timestamp: Date.now(),
            isHidden: true,
        };
        chat.history.push(hiddenMessage);

        // 【核心修改】只保存数据和更新UI，不调用 triggerAiResponse()
        await db.chats.put(chat);
        renderChatInterface(state.activeChatId);
    }
}
// ▲▲▲ 替换结束 ▲▲▲

/**
 * 显示投票结果详情
 * @param {number} timestamp - 投票消息的时间戳
 */
function showPollResults(timestamp) {
    const chat = state.chats[state.activeChatId];
    const poll = chat.history.find(m => m.timestamp === timestamp);
    if (!poll || !poll.isClosed) return;

    let resultsHtml = `<p><strong>${poll.question}</strong></p><hr style="opacity: 0.2; margin: 10px 0;">`;
    
    if (Object.keys(poll.votes).length === 0) {
        resultsHtml += '<p style="color: #8a8a8a;">还没有人投票。</p>';
    } else {
        poll.options.forEach(option => {
            const voters = poll.votes[option] || [];
            resultsHtml += `
                <div style="margin-bottom: 15px;">
                    <p style="font-weight: 500; margin: 0 0 5px 0;">${option} (${voters.length}票)</p>
                    <p style="font-size: 13px; color: #555; margin: 0; line-height: 1.5;">
                        ${voters.length > 0 ? voters.join('、 ') : '无人投票'}
                    </p>
                </div>
            `;
        });
    }

    showCustomAlert("投票结果", resultsHtml);
}

// ▲▲▲ 新函数粘贴结束 ▲▲▲

// ▼▼▼ 【全新】AI头像库管理功能函数 ▼▼▼

/**
 * 打开AI头像库管理模态框
 */
function openAiAvatarLibraryModal() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    document.getElementById('ai-avatar-library-title').textContent = `“${chat.name}”的头像库`;
    renderAiAvatarLibrary();
    document.getElementById('ai-avatar-library-modal').classList.add('visible');
}

/**
 * 渲染AI头像库的内容
 */
function renderAiAvatarLibrary() {
    const grid = document.getElementById('ai-avatar-library-grid');
    grid.innerHTML = '';
    const chat = state.chats[state.activeChatId];
    const library = chat.settings.aiAvatarLibrary || [];

    if (library.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1; text-align: center;">这个头像库还是空的，点击右上角“添加”吧！</p>';
        return;
    }

    library.forEach((avatar, index) => {
        const item = document.createElement('div');
        item.className = 'sticker-item'; // 复用表情面板的样式
        item.style.backgroundImage = `url(${avatar.url})`;
        item.title = avatar.name;

        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.style.display = 'block'; // 总是显示删除按钮
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            const confirmed = await showCustomConfirm('删除头像', `确定要从头像库中删除“${avatar.name}”吗？`, { confirmButtonClass: 'btn-danger' });
            if (confirmed) {
                chat.settings.aiAvatarLibrary.splice(index, 1);
                await db.chats.put(chat);
                renderAiAvatarLibrary();
            }
        };
        item.appendChild(deleteBtn);
        grid.appendChild(item);
    });
}

/**
 * 向当前AI的头像库中添加新头像
 */
async function addAvatarToLibrary() {
    const name = await showCustomPrompt("添加头像", "请为这个头像起个名字（例如：开心、哭泣）");
    if (!name || !name.trim()) return;

    const url = await showCustomPrompt("添加头像", "请输入头像的图片URL", "", "url");
    if (!url || !url.trim().startsWith('http')) {
        alert("请输入有效的图片URL！");
        return;
    }
    
    const chat = state.chats[state.activeChatId];
    if (!chat.settings.aiAvatarLibrary) {
        chat.settings.aiAvatarLibrary = [];
    }

    chat.settings.aiAvatarLibrary.push({ name: name.trim(), url: url.trim() });
    await db.chats.put(chat);
    renderAiAvatarLibrary();
}

/**
 * 关闭AI头像库管理模态框
 */
function closeAiAvatarLibraryModal() {
    document.getElementById('ai-avatar-library-modal').classList.remove('visible');
}

// ▲▲▲ 新函数粘贴结束 ▲▲▲


        // ===================================================================
        // 4. 初始化函数 init()
        // ===================================================================
        async function init() {

    // ▼▼▼ 新增代码 ▼▼▼
    const customBubbleStyleTag = document.createElement('style');
    customBubbleStyleTag.id = 'custom-bubble-style';
    document.head.appendChild(customBubbleStyleTag);
    // ▲▲▲ 新增结束 ▲▲▲

    // ▼▼▼ 新增代码 ▼▼▼
    const previewBubbleStyleTag = document.createElement('style');
    previewBubbleStyleTag.id = 'preview-bubble-style';
    document.head.appendChild(previewBubbleStyleTag);
    // ▲▲▲ 新增结束 ▲▲▲


    // ▼▼▼ 修改这两行 ▼▼▼
    applyScopedCss('', '#chat-messages', 'custom-bubble-style'); // 清除真实聊天界面的自定义样式
    applyScopedCss('', '#settings-preview-area', 'preview-bubble-style'); // 清除预览区的自定义样式
    // ▲▲▲ 修改结束 ▲▲▲

            window.showScreen = showScreen;
            window.renderChatListProxy = renderChatList;
            window.renderApiSettingsProxy = renderApiSettings;
            window.renderWallpaperScreenProxy = renderWallpaperScreen;
            window.renderWorldBookScreenProxy = renderWorldBookScreen;

            await loadAllDataFromDB();

            // 遷移世界書數據（添加新字段的默認值）
            await migrateWorldBooksData();

            // 初始化未读动态计数
            const storedCount = parseInt(localStorage.getItem('unreadPostsCount')) || 0;
            updateUnreadIndicator(storedCount);
            
            // ▲▲▲ 代码添加结束 ▲▲▲

            if (state.globalSettings && state.globalSettings.fontUrl) {
                applyCustomFont(state.globalSettings.fontUrl);
            }

            updateClock();
            setInterval(updateClock, 1000 * 30);
            applyGlobalWallpaper();
            initBatteryManager(); 

            // ==========================================================
            // --- 各种事件监听器 ---
            // ==========================================================

            document.getElementById('custom-modal-cancel').addEventListener('click', hideCustomModal);
            document.getElementById('custom-modal-overlay').addEventListener('click', (e) => { if (e.target === modalOverlay) hideCustomModal(); });
            document.getElementById('export-data-btn').addEventListener('click', exportBackup);
            document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-data-input').click());
            document.getElementById('import-data-input').addEventListener('change', e => importBackup(e.target.files[0]));
            document.getElementById('back-to-list-btn').addEventListener('click', () => { 

    // ▼▼▼ 修改这两行 ▼▼▼
    applyScopedCss('', '#chat-messages', 'custom-bubble-style'); // 清除真实聊天界面的自定义样式
    applyScopedCss('', '#settings-preview-area', 'preview-bubble-style'); // 清除预览区的自定义样式
    // ▲▲▲ 修改结束 ▲▲▲

exitSelectionMode(); state.activeChatId = null; showScreen('chat-list-screen'); });
            
            document.getElementById('add-chat-btn').addEventListener('click', async () => { const name = await showCustomPrompt('创建新聊天', '请输入Ta的名字'); if (name && name.trim()) { const newChatId = 'chat_' + Date.now(); 
const newChat = { 
    id: newChatId, 
    name: name.trim(), 
    isGroup: false,                         relationship: {
                            status: 'friend', // 'friend', 'blocked_by_user', 'pending_user_approval'
                            blockedTimestamp: null,
                            applicationReason: ''
                        },
                        status: {
                            text: '在线',
                            lastUpdate: Date.now(),
                            isBusy: false 
                        },
    settings: { 
        aiPersona: '你是谁呀。', 
        myPersona: '我是谁呀。', 
        maxMemory: 10, 
        aiAvatar: defaultAvatar, 
        myAvatar: defaultAvatar, 
        background: '', 
        theme: 'default', 
    fontSize: 13, 
    customCss: '', // <--- 新增这行
    linkedWorldBookIds: [], 
    aiAvatarLibrary: [],
    aiAvatarFrame: '', 
        myAvatarFrame: '' 
    }, 
    history: [], 
    musicData: { totalTime: 0 } 
};
state.chats[newChatId] = newChat; await db.chats.put(newChat); renderChatList(); } });

            // ▼▼▼ 【修正】创建群聊按钮现在打开联系人选择器 ▼▼▼
document.getElementById('add-group-chat-btn').addEventListener('click', openContactPickerForGroupCreate);
// ▲▲▲ 替换结束 ▲▲▲                      
            document.getElementById('transfer-cancel-btn').addEventListener('click', () => document.getElementById('transfer-modal').classList.remove('visible'));
            document.getElementById('transfer-confirm-btn').addEventListener('click', sendUserTransfer);

            document.getElementById('listen-together-btn').addEventListener('click', handleListenTogetherClick);
            document.getElementById('music-exit-btn').addEventListener('click', () => endListenTogetherSession(true));
            document.getElementById('music-return-btn').addEventListener('click', returnToChat);
            document.getElementById('music-play-pause-btn').addEventListener('click', togglePlayPause);
            document.getElementById('music-next-btn').addEventListener('click', playNext);
            document.getElementById('music-prev-btn').addEventListener('click', playPrev);
            document.getElementById('music-mode-btn').addEventListener('click', changePlayMode);
            document.getElementById('music-playlist-btn').addEventListener('click', () => { updatePlaylistUI(); document.getElementById('music-playlist-panel').classList.add('visible'); });
            document.getElementById('close-playlist-btn').addEventListener('click', () => document.getElementById('music-playlist-panel').classList.remove('visible'));
            document.getElementById('add-song-url-btn').addEventListener('click', addSongFromURL);
            document.getElementById('add-song-local-btn').addEventListener('click', () => document.getElementById('local-song-upload-input').click());
            document.getElementById('local-song-upload-input').addEventListener('change', addSongFromLocal);
            audioPlayer.addEventListener('ended', playNext);
            audioPlayer.addEventListener('pause', () => { if(musicState.isActive) { musicState.isPlaying = false; updatePlayerUI(); } });
            audioPlayer.addEventListener('play', () => { if(musicState.isActive) { musicState.isPlaying = true; updatePlayerUI(); } });

            const chatInput = document.getElementById('chat-input');
            document.getElementById('send-btn').addEventListener('click', async () => { const content = chatInput.value.trim(); if (!content || !state.activeChatId) return; const chat = state.chats[state.activeChatId]; const msg = { role: 'user', content, timestamp: Date.now() }; chat.history.push(msg); await db.chats.put(chat); appendMessage(msg, chat); renderChatList(); chatInput.value = ''; chatInput.style.height = 'auto'; chatInput.focus(); });
            document.getElementById('wait-reply-btn').addEventListener('click', triggerAiResponse);
            chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('send-btn').click(); } });
            chatInput.addEventListener('input', () => { chatInput.style.height = 'auto'; chatInput.style.height = (chatInput.scrollHeight) + 'px'; });

        // ▼▼▼ 新增@功能 ▼▼▼
        // 初始化@功能
        initMentionFeature(chatInput, state);
        // ▲▲▲ 新增結束 ▲▲▲

            document.getElementById('wallpaper-upload-input').addEventListener('change', async (event) => { const file = event.target.files[0]; if(file) { const dataUrl = await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = () => res(reader.result); reader.onerror = () => rej(reader.error); reader.readAsDataURL(file); }); newWallpaperBase64 = dataUrl; renderWallpaperScreen(); } });
            document.getElementById('save-wallpaper-btn').addEventListener('click', async () => { if (newWallpaperBase64) { state.globalSettings.wallpaper = newWallpaperBase64; await db.globalSettings.put(state.globalSettings); applyGlobalWallpaper(); newWallpaperBase64 = null; alert('壁纸已保存并应用！'); showScreen('home-screen'); } else alert('请先上传一张新壁纸。'); });
            document.getElementById('save-api-settings-btn').addEventListener('click', async () => { 
                // 保存API服务商设置
                state.apiConfig.provider = document.getElementById('api-provider').value;
                state.apiConfig.proxyUrl = document.getElementById('proxy-url').value.trim(); 
                state.apiConfig.apiKey = document.getElementById('api-key').value.trim(); 
                state.apiConfig.model = document.getElementById('model-select').value; 
                await db.apiConfig.put(state.apiConfig); 

// 在 'save-api-settings-btn' 的 click 事件监听器内部
// await db.apiConfig.put(state.apiConfig); 这行之后

// ▼▼▼ 将之前那段保存后台活动设置的逻辑，替换为下面这个增强版 ▼▼▼

const backgroundSwitch = document.getElementById('background-activity-switch');
const intervalInput = document.getElementById('background-interval-input');
const newEnableState = backgroundSwitch.checked;
const oldEnableState = state.globalSettings.enableBackgroundActivity || false;

// 只有在用户“从关到开”时，才弹出警告
if (newEnableState && !oldEnableState) {
    const userConfirmed = confirm(
        "【高费用警告】\n\n" +
        "您正在启用“后台角色活动”功能。\n\n" +
        "这会使您的AI角色们在您不和他们聊天时，也能“独立思考”并主动给您发消息或进行社交互动，极大地增强沉浸感。\n\n" +
        "但请注意：\n" +
        "这会【在后台自动、定期地调用API】，即使您不进行任何操作。根据您的角色数量和检测间隔，这可能会导致您的API费用显著增加。\n\n" +
        "您确定要开启吗？"
    );

    if (!userConfirmed) {
        backgroundSwitch.checked = false; // 用户取消，把开关拨回去
        return; // 阻止后续逻辑
    }
}

state.globalSettings.enableBackgroundActivity = newEnableState;
state.globalSettings.backgroundActivityInterval = parseInt(intervalInput.value) || 60;
state.globalSettings.blockCooldownHours = parseFloat(document.getElementById('block-cooldown-input').value) || 1;
await db.globalSettings.put(state.globalSettings);

// 保存圖像生成設置前先更新UI
updateImageModelUI();

// 保存圖像生成設置
state.imageConfig.model = document.getElementById('image-model-select').value;
state.imageConfig.apiUrl = document.getElementById('image-api-url').value.trim();
state.imageConfig.apiKey = document.getElementById('image-api-key').value.trim();
state.imageConfig.autoGenerate = document.getElementById('auto-generate-images').checked;
state.imageConfig.aiImageGeneration = document.getElementById('ai-image-generation').checked;
state.imageConfig.imageGenerationFrequency = document.getElementById('image-generation-frequency').value;
state.imageConfig.quality = document.getElementById('image-quality-select').value;
state.imageConfig.size = document.getElementById('image-size-select').value;
await db.imageConfig.put(state.imageConfig);

console.log('[圖像設置] 已保存配置:', state.imageConfig);

// 动态启动或停止模拟器
stopBackgroundSimulation();
if (state.globalSettings.enableBackgroundActivity) {
    startBackgroundSimulation();
    console.log(`后台活动模拟已启动，间隔: ${state.globalSettings.backgroundActivityInterval}秒`);
} else {
    console.log("后台活动模拟已停止。");
}
// ▲▲▲ 替换结束 ▲▲▲

alert('API設置已保存!'); });
            document.getElementById('fetch-models-btn').addEventListener('click', async () => {
                const provider = document.getElementById('api-provider').value;
                const url = document.getElementById('proxy-url').value.trim();
                const key = document.getElementById('api-key').value.trim();
                
                if (!url || !key) return alert('请先填写API地址和密钥');
                
                try {
                    let models = [];
                    
                    // 根据不同的API服务商使用不同的获取方式
                    if (provider === 'gemini') {
                        // Gemini API使用不同的端点，但經常有CORS問題，使用預設模型
                        try {
                            const response = await fetch(`${url}/v1beta/models?key=${key}`);
                            if (response.ok) {
                                const data = await response.json();
                                models = data.models.map(model => ({
                                    id: model.name.split('/').pop(),
                                    name: model.displayName || model.name
                                }));
                            } else {
                                throw new Error('API調用失敗');
                            }
                        } catch (error) {
                            // 如果API調用失敗，使用預設模型
                            models = [
                                { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro (推薦)' },
                                { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash' },
                                { id: 'gemini-pro', name: 'Gemini Pro' }
                            ];
                        }
                    } else if (provider === 'claude') {
                        // Claude API没有公开的模型列表端点，使用预设
                        models = [
                            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
                            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
                            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
                            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' }
                        ];
                    } else if (provider === 'deepseek') {
                        // DeepSeek API使用标准OpenAI格式
                        const response = await fetch(`${url}/v1/models`, {
                            headers: { 'Authorization': `Bearer ${key}` }
                        });
                        if (!response.ok) throw new Error('无法获取DeepSeek模型列表');
                        const data = await response.json();
                        models = data.data.map(model => ({ id: model.id, name: model.id }));
                    } else {
                        // OpenAI或自定义API使用标准格式
                        const response = await fetch(`${url}/v1/models`, {
                            headers: { 'Authorization': `Bearer ${key}` }
                        });
                        if (!response.ok) throw new Error('无法获取模型列表');
                        const data = await response.json();
                        models = data.data.map(model => ({ id: model.id, name: model.id }));
                    }
                    
                    // 更新模型选择器
                    const modelSelect = document.getElementById('model-select');
                    modelSelect.innerHTML = '';
                    models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.id;
                        option.textContent = model.name;
                        if (model.id === state.apiConfig.model) option.selected = true;
                        modelSelect.appendChild(option);
                    });
                    
                    alert('模型列表已更新');
                } catch (error) {
                    alert(`拉取模型失败: ${error.message}`);
                }
            });
            document.getElementById('add-world-book-btn').addEventListener('click', async () => { 
                const name = await showCustomPrompt('创建世界书', '请输入书名'); 
                if (name && name.trim()) { 
                    const newBook = { 
                        id: 'wb_' + Date.now(), 
                        name: name.trim(), 
                        content: '',
                        priority: '普通',
                        trigger: 'Always On',
                        keywords: '',
                        category: '備註'
                    }; 
                    await db.worldBooks.add(newBook); 
                    state.worldBooks.push(newBook); 
                    renderWorldBookScreen(); 
                    openWorldBookEditor(newBook.id); 
                    
                    // 通知VN面板世界書數據已更新
                    notifyVNPanelWorldBooksUpdated();
                } 
            });
            // 世界書觸發選擇變化事件
            document.getElementById('world-book-trigger-select').addEventListener('change', function() {
                const keywordsGroup = document.getElementById('world-book-keywords-group');
                if (this.value === 'Keywords') {
                    keywordsGroup.style.display = 'block';
                } else {
                    keywordsGroup.style.display = 'none';
                }
            });
            
            document.getElementById('save-world-book-btn').addEventListener('click', async () => { 
                if (!editingWorldBookId) return; 
                const book = state.worldBooks.find(wb => wb.id === editingWorldBookId); 
                if (book) { 
                    const newName = document.getElementById('world-book-name-input').value.trim(); 
                    if (!newName) { 
                        alert('书名不能为空！'); 
                        return; 
                    } 
                    book.name = newName; 
                    book.content = document.getElementById('world-book-content-input').value; 
                    
                    // 新增字段：排列、觸發、關鍵字、分類
                    book.priority = document.getElementById('world-book-priority-select').value || '普通';
                    book.trigger = document.getElementById('world-book-trigger-select').value || 'Always On';
                    book.keywords = document.getElementById('world-book-keywords-input').value.trim() || '';
                    book.category = document.getElementById('world-book-category-select').value || '備註';
                    
                    await db.worldBooks.put(book); 
                    document.getElementById('world-book-editor-title').textContent = newName; 
                    editingWorldBookId = null; 
                    renderWorldBookScreen(); 
                    showScreen('world-book-screen'); 
                    
                    // 通知VN面板世界書數據已更新
                    notifyVNPanelWorldBooksUpdated();
                } 
            });

            document.getElementById('chat-messages').addEventListener('click', (e) => { const aiImage = e.target.closest('.ai-generated-image'); if (aiImage) { const description = aiImage.dataset.description; if (description) showCustomAlert('照片描述', description); return; } const voiceMessage = e.target.closest('.voice-message-body'); if (voiceMessage) { const text = voiceMessage.dataset.text; if (text) showCustomAlert('语音内容', text); return; } });
            
            const chatSettingsModal = document.getElementById('chat-settings-modal');
            const worldBookSelectBox = document.querySelector('.custom-multiselect .select-box');
            const worldBookCheckboxesContainer = document.getElementById('world-book-checkboxes-container');
function updateWorldBookSelectionDisplay() { const checkedBoxes = worldBookCheckboxesContainer.querySelectorAll('input:checked'); const displayText = document.querySelector('.selected-options-text'); if (checkedBoxes.length === 0) { displayText.textContent = '-- 点击选择 --'; } else if (checkedBoxes.length > 2) { displayText.textContent = `已选择 ${checkedBoxes.length} 项`; } else { displayText.textContent = Array.from(checkedBoxes).map(cb => cb.parentElement.textContent.trim()).join(', '); } }        
            
            worldBookSelectBox.addEventListener('click', (e) => { e.stopPropagation(); worldBookCheckboxesContainer.classList.toggle('visible'); worldBookSelectBox.classList.toggle('expanded'); });
            document.getElementById('world-book-checkboxes-container').addEventListener('change', updateWorldBookSelectionDisplay);
            window.addEventListener('click', (e) => { if (!document.querySelector('.custom-multiselect').contains(e.target)) { worldBookCheckboxesContainer.classList.remove('visible'); worldBookSelectBox.classList.remove('expanded'); } });

// ▼▼▼ 请用这段【完整、全新的代码】替换旧的 chat-settings-btn 点击事件 ▼▼▼
document.getElementById('chat-settings-btn').addEventListener('click', async () => {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const isGroup = chat.isGroup;

    // --- 统一显示/隐藏控件 ---
    document.getElementById('chat-name-group').style.display = 'block';
    document.getElementById('my-persona-group').style.display = 'block';
    document.getElementById('my-avatar-group').style.display = 'block';
    document.getElementById('my-group-nickname-group').style.display = isGroup ? 'block' : 'none';
    document.getElementById('group-avatar-group').style.display = isGroup ? 'block' : 'none';
    document.getElementById('group-members-group').style.display = isGroup ? 'block' : 'none';
    document.getElementById('ai-persona-group').style.display = isGroup ? 'none' : 'block';
    document.getElementById('ai-avatar-group').style.display = isGroup ? 'none' : 'block';
    
    // 【核心修改1】根据是否为群聊，显示或隐藏“好友分组”区域
    document.getElementById('assign-group-section').style.display = isGroup ? 'none' : 'block';
    
    // 載入人設庫到下拉選單（只對單聊顯示）
    const importPersonaGroup = document.getElementById('import-persona-group');
    importPersonaGroup.style.display = isGroup ? 'none' : 'block';
    
    if (!isGroup) {
        loadCharacterLibraryToSelect();
    }
    
    // --- 加载表单数据 ---
    document.getElementById('chat-name-input').value = chat.name;
    document.getElementById('my-persona').value = chat.settings.myPersona;
    
    // 重置人設導入下拉選單
    if (!isGroup) {
        const importPersonaSelect = document.getElementById('import-persona-select');
        if (importPersonaSelect) {
            importPersonaSelect.value = '';
        }
    }
    document.getElementById('my-avatar-preview').src = chat.settings.myAvatar || (isGroup ? defaultMyGroupAvatar : defaultAvatar);
    document.getElementById('max-memory').value = chat.settings.maxMemory;
    const bgPreview = document.getElementById('bg-preview');
    const removeBgBtn = document.getElementById('remove-bg-btn');
    if (chat.settings.background) {
        bgPreview.src = chat.settings.background;
        bgPreview.style.display = 'block';
        removeBgBtn.style.display = 'inline-block';
    } else {
        bgPreview.style.display = 'none';
        removeBgBtn.style.display = 'none';
    }

    if (isGroup) {
        document.getElementById('my-group-nickname-input').value = chat.settings.myNickname || '';
        document.getElementById('group-avatar-preview').src = chat.settings.groupAvatar || defaultGroupAvatar;
        renderGroupMemberSettings(chat.members);
    } else {
        document.getElementById('ai-persona').value = chat.settings.aiPersona;
        document.getElementById('ai-avatar-preview').src = chat.settings.aiAvatar || defaultAvatar;
        
        // 【核心修改2】如果是单聊，就加载分组列表到下拉框
        const select = document.getElementById('assign-group-select');
        select.innerHTML = '<option value="">未分组</option>'; // 清空并设置默认选项
        const groups = await db.qzoneGroups.toArray();
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            // 如果当前好友已经有分组，就默认选中它
            if (chat.groupId === group.id) {
                option.selected = true;
            }
            select.appendChild(option);
        }); 
    }
    
    // 加载世界书
    const worldBookCheckboxesContainer = document.getElementById('world-book-checkboxes-container');
    worldBookCheckboxesContainer.innerHTML = '';
    const linkedIds = chat.settings.linkedWorldBookIds || [];
    if (state.worldBooks.length > 0) {
        state.worldBooks.forEach(book => {
            const isChecked = linkedIds.includes(book.id);
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${book.id}" ${isChecked ? 'checked' : ''}> ${book.name}`;
            worldBookCheckboxesContainer.appendChild(label);
        });
    }
    updateWorldBookSelectionDisplay();

    // 加载并更新所有预览相关控件
    const themeRadio = document.querySelector(`input[name="theme-select"][value="${chat.settings.theme || 'default'}"]`);
    if (themeRadio) themeRadio.checked = true;
    const fontSizeSlider = document.getElementById('font-size-slider');
    fontSizeSlider.value = chat.settings.fontSize || 13;
    document.getElementById('font-size-value').textContent = `${fontSizeSlider.value}px`;
    const customCssInput = document.getElementById('custom-css-input');
    customCssInput.value = chat.settings.customCss || '';
    
    updateSettingsPreview(); 
    document.getElementById('chat-settings-modal').classList.add('visible');
});
// ▲▲▲ 替换结束 ▲▲▲
            
            function renderGroupMemberSettings(members) { const container = document.getElementById('group-members-settings'); container.innerHTML = ''; members.forEach(member => { const div = document.createElement('div'); div.className = 'member-editor'; div.dataset.memberId = member.id; div.innerHTML = `<img src="${member.avatar}" alt="${member.name}"><div class="member-name">${member.name}</div>`; div.addEventListener('click', () => openMemberEditor(member.id)); container.appendChild(div); }); }
            function openMemberEditor(memberId) { editingMemberId = memberId; const chat = state.chats[state.activeChatId]; const member = chat.members.find(m => m.id === memberId); document.getElementById('member-name-input').value = member.name; document.getElementById('member-persona-input').value = member.persona; document.getElementById('member-avatar-preview').src = member.avatar; document.getElementById('member-settings-modal').classList.add('visible'); }

            document.getElementById('cancel-member-settings-btn').addEventListener('click', () => { document.getElementById('member-settings-modal').classList.remove('visible'); editingMemberId = null; });
            document.getElementById('save-member-settings-btn').addEventListener('click', () => { if (!editingMemberId) return; const chat = state.chats[state.activeChatId]; const member = chat.members.find(m => m.id === editingMemberId); member.name = document.getElementById('member-name-input').value; member.persona = document.getElementById('member-persona-input').value; member.avatar = document.getElementById('member-avatar-preview').src; renderGroupMemberSettings(chat.members); document.getElementById('member-settings-modal').classList.remove('visible'); });
            document.getElementById('reset-theme-btn').addEventListener('click', () => { document.getElementById('theme-default').checked = true; });
            document.getElementById('cancel-chat-settings-btn').addEventListener('click', () => { chatSettingsModal.classList.remove('visible'); });

document.getElementById('save-chat-settings-btn').addEventListener('click', async () => {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const newName = document.getElementById('chat-name-input').value.trim();
    if (!newName) return alert('备注名/群名不能为空！');
    chat.name = newName;
    const selectedThemeRadio = document.querySelector('input[name="theme-select"]:checked');
    chat.settings.theme = selectedThemeRadio ? selectedThemeRadio.value : 'default';

    chat.settings.fontSize = parseInt(document.getElementById('font-size-slider').value);
    chat.settings.customCss = document.getElementById('custom-css-input').value.trim();

    chat.settings.myPersona = document.getElementById('my-persona').value;
    chat.settings.myAvatar = document.getElementById('my-avatar-preview').src;
    const checkedBooks = document.querySelectorAll('#world-book-checkboxes-container input[type="checkbox"]:checked');
    chat.settings.linkedWorldBookIds = Array.from(checkedBooks).map(cb => cb.value);

    if (chat.isGroup) {
        chat.settings.myNickname = document.getElementById('my-group-nickname-input').value.trim();
        chat.settings.groupAvatar = document.getElementById('group-avatar-preview').src;
    } else {
        chat.settings.aiPersona = document.getElementById('ai-persona').value;
        chat.settings.aiAvatar = document.getElementById('ai-avatar-preview').src;
        const selectedGroupId = document.getElementById('assign-group-select').value;
        chat.groupId = selectedGroupId ? parseInt(selectedGroupId) : null;
    }

    chat.settings.maxMemory = parseInt(document.getElementById('max-memory').value) || 10;
    await db.chats.put(chat);

    applyScopedCss(chat.settings.customCss, '#chat-messages', 'custom-bubble-style');
    
    chatSettingsModal.classList.remove('visible');
    renderChatInterface(state.activeChatId);
    renderChatList();
});
            document.getElementById('clear-chat-btn').addEventListener('click', async () => { if (!state.activeChatId) return; const chat = state.chats[state.activeChatId]; const confirmed = await showCustomConfirm('清空聊天记录', '此操作将永久删除此聊天的所有消息，无法恢复。确定要清空吗？', { confirmButtonClass: 'btn-danger' }); if (confirmed) { chat.history = []; await db.chats.put(chat); renderChatInterface(state.activeChatId); renderChatList(); chatSettingsModal.classList.remove('visible'); } });
            
            const setupFileUpload = (inputId, callback) => { document.getElementById(inputId).addEventListener('change', async (event) => { const file = event.target.files[0]; if (file) { const dataUrl = await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = () => res(reader.result); reader.onerror = () => rej(reader.error); reader.readAsDataURL(file); }); callback(dataUrl); event.target.value = null; } }); };
            setupFileUpload('ai-avatar-input', (base64) => document.getElementById('ai-avatar-preview').src = base64);
            setupFileUpload('my-avatar-input', (base64) => document.getElementById('my-avatar-preview').src = base64);
            setupFileUpload('group-avatar-input', (base64) => document.getElementById('group-avatar-preview').src = base64);
            setupFileUpload('member-avatar-input', (base64) => document.getElementById('member-avatar-preview').src = base64);
            setupFileUpload('bg-input', (base64) => { if(state.activeChatId) { state.chats[state.activeChatId].settings.background = base64; const bgPreview = document.getElementById('bg-preview'); bgPreview.src = base64; bgPreview.style.display = 'block'; document.getElementById('remove-bg-btn').style.display = 'inline-block'; } });
            setupFileUpload('preset-avatar-input', (base64) => document.getElementById('preset-avatar-preview').src = base64);
            document.getElementById('remove-bg-btn').addEventListener('click', () => { if (state.activeChatId) { state.chats[state.activeChatId].settings.background = ''; const bgPreview = document.getElementById('bg-preview'); bgPreview.src = ''; bgPreview.style.display = 'none'; document.getElementById('remove-bg-btn').style.display = 'none'; } });

            const stickerPanel = document.getElementById('sticker-panel');
            document.getElementById('open-sticker-panel-btn').addEventListener('click', () => { renderStickerPanel(); stickerPanel.classList.add('visible'); });
            document.getElementById('close-sticker-panel-btn').addEventListener('click', () => stickerPanel.classList.remove('visible'));
            document.getElementById('add-sticker-btn').addEventListener('click', async () => { const url = await showCustomPrompt("添加表情(URL)", "请输入表情包的图片URL"); if (!url || !url.trim().startsWith('http')) return url && alert("请输入有效的URL (以http开头)"); const name = await showCustomPrompt("命名表情", "请为这个表情命名 (例如：开心、疑惑)"); if (name && name.trim()) { const newSticker = { id: 'sticker_' + Date.now(), url: url.trim(), name: name.trim() }; await db.userStickers.add(newSticker); state.userStickers.push(newSticker); renderStickerPanel(); } else if (name !== null) alert("表情名不能为空！"); });
            document.getElementById('upload-sticker-btn').addEventListener('click', () => document.getElementById('sticker-upload-input').click());
            document.getElementById('sticker-upload-input').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = async () => { const base64Url = reader.result; const name = await showCustomPrompt("命名表情", "请为这个表情命名 (例如：好耶、疑惑)"); if (name && name.trim()) { const newSticker = { id: 'sticker_' + Date.now(), url: base64Url, name: name.trim() }; await db.userStickers.add(newSticker); state.userStickers.push(newSticker); renderStickerPanel(); } else if (name !== null) alert("表情名不能为空！"); }; event.target.value = null; });

            document.getElementById('upload-image-btn').addEventListener('click', () => document.getElementById('image-upload-input').click());
            document.getElementById('image-upload-input').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file || !state.activeChatId) return; const reader = new FileReader(); reader.onload = async (e) => { const base64Url = e.target.result; const chat = state.chats[state.activeChatId]; const msg = { role: 'user', content: [{ type: 'image_url', image_url: { url: base64Url } }], timestamp: Date.now() }; chat.history.push(msg); await db.chats.put(chat); appendMessage(msg, chat); renderChatList(); }; reader.readAsDataURL(file); event.target.value = null; });
            document.getElementById('voice-message-btn').addEventListener('click', async () => { if (!state.activeChatId) return; const text = await showCustomPrompt("发送语音", "请输入你想说的内容："); if (text && text.trim()) { const chat = state.chats[state.activeChatId]; const msg = { role: 'user', type: 'voice_message', content: text.trim(), timestamp: Date.now() }; chat.history.push(msg); await db.chats.put(chat); appendMessage(msg, chat); renderChatList(); } });
            document.getElementById('send-photo-btn').addEventListener('click', async () => { if (!state.activeChatId) return; const description = await showCustomPrompt("发送照片", "请用文字描述您要发送的照片："); if (description && description.trim()) { const chat = state.chats[state.activeChatId]; const msg = { role: 'user', type: 'user_photo', content: description.trim(), timestamp: Date.now() }; chat.history.push(msg); await db.chats.put(chat); appendMessage(msg, chat); renderChatList(); } });

// ▼▼▼ 【全新】外卖请求功能事件绑定 ▼▼▼
const waimaiModal = document.getElementById('waimai-request-modal');
document.getElementById('send-waimai-request-btn').addEventListener('click', () => {
    waimaiModal.classList.add('visible');
});

document.getElementById('waimai-cancel-btn').addEventListener('click', () => {
    waimaiModal.classList.remove('visible');
});

document.getElementById('waimai-confirm-btn').addEventListener('click', async () => {
    if (!state.activeChatId) return;
    
    const productInfoInput = document.getElementById('waimai-product-info');
    const amountInput = document.getElementById('waimai-amount');
    
    const productInfo = productInfoInput.value.trim();
    const amount = parseFloat(amountInput.value);

    if (!productInfo) {
        alert('请输入商品信息！');
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        alert('请输入有效的代付金额！');
        return;
    }

    const chat = state.chats[state.activeChatId];
    const now = Date.now();

    // 【核心修正】在这里获取用户自己的昵称
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
    
    const msg = {
        role: 'user',
        // 【核心修正】将获取到的昵称，作为 senderName 添加到消息对象中
        senderName: myNickname, 
        type: 'waimai_request',
        productInfo: productInfo,
        amount: amount,
        status: 'pending',
        countdownEndTime: now + 15 * 60 * 1000,
        timestamp: now
    };

    chat.history.push(msg);
    await db.chats.put(chat);
    appendMessage(msg, chat);
    renderChatList();

    productInfoInput.value = '';
    amountInput.value = '';
    waimaiModal.classList.remove('visible');
});         
            document.getElementById('open-persona-library-btn').addEventListener('click', openPersonaLibrary);
            document.getElementById('close-persona-library-btn').addEventListener('click', closePersonaLibrary);
            document.getElementById('add-persona-preset-btn').addEventListener('click', openPersonaEditorForCreate);
            document.getElementById('cancel-persona-editor-btn').addEventListener('click', closePersonaEditor);
            document.getElementById('save-persona-preset-btn').addEventListener('click', savePersonaPreset);
            document.getElementById('preset-action-edit').addEventListener('click', openPersonaEditorForEdit);
            document.getElementById('preset-action-delete').addEventListener('click', deletePersonaPreset);
            document.getElementById('preset-action-cancel').addEventListener('click', hidePresetActions);
            
            document.getElementById('selection-cancel-btn').addEventListener('click', exitSelectionMode);

// ▼▼▼ 【最终加强版】用这块代码替换旧的 selection-delete-btn 事件监听器 ▼▼▼
document.getElementById('selection-delete-btn').addEventListener('click', async () => {
    if (selectedMessages.size === 0) return;
    const confirmed = await showCustomConfirm('删除消息', `确定要删除选中的 ${selectedMessages.size} 条消息吗？这将改变AI的记忆。`, { confirmButtonClass: 'btn-danger' });
    if (confirmed) {
        const chat = state.chats[state.activeChatId];
        
        // 1. 【核心加强】在删除前，检查被删除的消息中是否包含投票
        let deletedPollsInfo = [];
        for (const timestamp of selectedMessages) {
            const msg = chat.history.find(m => m.timestamp === timestamp);
            if (msg && msg.type === 'poll') {
                deletedPollsInfo.push(`关于“${msg.question}”的投票(时间戳: ${msg.timestamp})`);
            }
        }
        
        // 2. 更新后端的历史记录
        chat.history = chat.history.filter(msg => !selectedMessages.has(msg.timestamp));
        
        // 3. 【核心加强】构建更具体的“遗忘指令”
        let forgetReason = "一些之前的消息已被用户删除。";
        if (deletedPollsInfo.length > 0) {
            forgetReason += ` 其中包括以下投票：${deletedPollsInfo.join('；')}。`;
        }
        forgetReason += " 你应该像它们从未存在过一样继续对话，并相应地调整你的记忆和行为，不要再提及这些被删除的内容。";

        const forgetInstruction = {
            role: 'system',
            content: `[系统提示：${forgetReason}]`,
            timestamp: Date.now(),
            isHidden: true 
        };
        chat.history.push(forgetInstruction);
        
        // 4. 将包含“遗忘指令”的、更新后的chat对象存回数据库
        await db.chats.put(chat);
        
        // 5. 最后才更新UI
        renderChatInterface(state.activeChatId);
        renderChatList();
    }
});
// ▲▲▲ 替换结束 ▲▲▲

// 为聊天设置里的“更换头像框”按钮添加点击事件
document.getElementById('chat-settings-modal').addEventListener('click', (e) => {
    if (e.target.classList.contains('change-frame-btn')) {
        // 'chat' 这个参数是告诉函数，这次是为“我/对方”这对组合更换头像框
        openFrameSelectorModal('chat');
    }
});

// 为成员设置里的“更换头像框”按钮添加点击事件
document.getElementById('member-settings-modal').addEventListener('click', (e) => {
    // 【修正】将 .contents 修改为 .contains
    if (e.target.classList.contains('change-frame-btn')) { 
        // 'member' 这个参数是告诉函数，这次是为单个群成员更换头像框
        openFrameSelectorModal('member');
    }
});

// ▲▲▲ 粘贴结束 ▲▲▲

            const fontUrlInput = document.getElementById('font-url-input');
            fontUrlInput.addEventListener('input', () => applyCustomFont(fontUrlInput.value.trim(), true));
            document.getElementById('save-font-btn').addEventListener('click', async () => {
                const newFontUrl = fontUrlInput.value.trim();
                if (!newFontUrl) { alert("请输入有效的字体URL。"); return; }
                applyCustomFont(newFontUrl, false);
                state.globalSettings.fontUrl = newFontUrl;
                await db.globalSettings.put(state.globalSettings);
                alert('字体已保存并应用！');
            });
            document.getElementById('reset-font-btn').addEventListener('click', resetToDefaultFont);

            document.querySelectorAll('#chat-list-bottom-nav .nav-item').forEach(item => { item.addEventListener('click', () => switchToChatListView(item.dataset.view)); });
            document.getElementById('qzone-back-btn').addEventListener('click', () => switchToChatListView('messages-view'));
            document.getElementById('qzone-nickname').addEventListener('click', async () => { const newNickname = await showCustomPrompt("修改昵称", "请输入新的昵称", state.qzoneSettings.nickname); if (newNickname && newNickname.trim()) { state.qzoneSettings.nickname = newNickname.trim(); await saveQzoneSettings(); renderQzoneScreen(); } });
            document.getElementById('qzone-avatar-container').addEventListener('click', () => document.getElementById('qzone-avatar-input').click());
            document.getElementById('qzone-banner-container').addEventListener('click', () => document.getElementById('qzone-banner-input').click());
            document.getElementById('qzone-avatar-input').addEventListener('change', async (event) => { const file = event.target.files[0]; if (file) { const dataUrl = await new Promise(res => { const reader = new FileReader(); reader.onload = () => res(reader.result); reader.readAsDataURL(file); }); state.qzoneSettings.avatar = dataUrl; await saveQzoneSettings(); renderQzoneScreen(); } event.target.value = null; });
            document.getElementById('qzone-banner-input').addEventListener('change', async (event) => { const file = event.target.files[0]; if (file) { const dataUrl = await new Promise(res => { const reader = new FileReader(); reader.onload = () => res(reader.result); reader.readAsDataURL(file); }); state.qzoneSettings.banner = dataUrl; await saveQzoneSettings(); renderQzoneScreen(); } event.target.value = null; });

// ▼▼▼ 【修正后】的“说说”按钮事件 ▼▼▼
document.getElementById('create-shuoshuo-btn').addEventListener('click', async () => {
    // 1. 重置并获取模态框
    resetCreatePostModal();
    const modal = document.getElementById('create-post-modal');
    
    // 2. 设置为“说说”模式
    modal.dataset.mode = 'shuoshuo';
    
    // 3. 隐藏与图片/文字图相关的部分
    modal.querySelector('.post-mode-switcher').style.display = 'none';
    modal.querySelector('#image-mode-content').style.display = 'none';
    modal.querySelector('#text-image-mode-content').style.display = 'none';
    
    // 4. 修改主输入框的提示语，使其更符合“说说”的场景
    modal.querySelector('#post-public-text').placeholder = '分享新鲜事...';
    
    // 5. 准备并显示模态框
    const visibilityGroupsContainer = document.getElementById('post-visibility-groups');
    visibilityGroupsContainer.innerHTML = '';
    const groups = await db.qzoneGroups.toArray();
    if (groups.length > 0) {
        groups.forEach(group => {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.innerHTML = `<input type="checkbox" name="visibility_group" value="${group.id}"> ${group.name}`;
            visibilityGroupsContainer.appendChild(label);
        });
    } else {
        visibilityGroupsContainer.innerHTML = '<p style="color: var(--text-secondary);">没有可用的分组</p>';
    }
    modal.classList.add('visible');
});

// ▼▼▼ 【修正后】的“动态”（图片）按钮事件 ▼▼▼
document.getElementById('create-post-btn').addEventListener('click', async () => {
    // 1. 重置并获取模态框
    resetCreatePostModal();
    const modal = document.getElementById('create-post-modal');
    
    // 2. 设置为“复杂动态”模式
    modal.dataset.mode = 'complex';
    
// 3. 确保与图片/文字图相关的部分是可见的
modal.querySelector('.post-mode-switcher').style.display = 'flex';
// 显式激活“上传图片”模式...
modal.querySelector('#image-mode-content').classList.add('active');
// ...同时确保“文字图”模式是隐藏的
modal.querySelector('#text-image-mode-content').classList.remove('active');
    
    // 4. 恢复主输入框的默认提示语
    modal.querySelector('#post-public-text').placeholder = '分享新鲜事...（非必填的公开文字）';

    // 5. 准备并显示模态框（与“说说”按钮的逻辑相同）
    const visibilityGroupsContainer = document.getElementById('post-visibility-groups');
    visibilityGroupsContainer.innerHTML = '';
    const groups = await db.qzoneGroups.toArray();
    if (groups.length > 0) {
        groups.forEach(group => {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.innerHTML = `<input type="checkbox" name="visibility_group" value="${group.id}"> ${group.name}`;
            visibilityGroupsContainer.appendChild(label);
        });
    } else {
        visibilityGroupsContainer.innerHTML = '<p style="color: var(--text-secondary);">没有可用的分组</p>';
    }
    modal.classList.add('visible');
});
            document.getElementById('open-album-btn').addEventListener('click', async () => { await renderAlbumList(); showScreen('album-screen'); });
            document.getElementById('album-back-btn').addEventListener('click', () => { showScreen('chat-list-screen'); switchToChatListView('qzone-screen'); });

// --- ↓↓↓ 从这里开始复制 ↓↓↓ ---

document.getElementById('album-photos-back-btn').addEventListener('click', () => {
    state.activeAlbumId = null;
    showScreen('album-screen');
});

document.getElementById('album-upload-photo-btn').addEventListener('click', () => document.getElementById('album-photo-input').click());

document.getElementById('album-photo-input').addEventListener('change', async (event) => {
    if (!state.activeAlbumId) return;
    const files = event.target.files;
    if (!files.length) return;

    const album = await db.qzoneAlbums.get(state.activeAlbumId);
    
    for (const file of files) {
        const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
        await db.qzonePhotos.add({ albumId: state.activeAlbumId, url: dataUrl, createdAt: Date.now() });
    }

    const photoCount = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).count();
    const updateData = { photoCount };
    
    if (!album.photoCount || album.coverUrl.includes('placeholder')) {
        const firstPhoto = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).first();
        if(firstPhoto) updateData.coverUrl = firstPhoto.url;
    }

    await db.qzoneAlbums.update(state.activeAlbumId, updateData);
    await renderAlbumPhotosScreen();
    await renderAlbumList();
    
    event.target.value = null;
    alert('照片上传成功！');
});

// --- ↑↑↑ 复制到这里结束 ↑↑↑ ---

// --- ↓↓↓ 从这里开始复制，完整替换掉旧的 photos-grid-page 监听器 ↓↓↓ ---

document.getElementById('photos-grid-page').addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.photo-delete-btn');
    const photoThumb = e.target.closest('.photo-thumb');

    if (deleteBtn) {
        e.stopPropagation(); // 阻止事件冒泡到图片上
        const photoId = parseInt(deleteBtn.dataset.photoId);
        const confirmed = await showCustomConfirm(
            '删除照片',
            '确定要删除这张照片吗？此操作不可恢复。',
            { confirmButtonClass: 'btn-danger' }
        );

        if (confirmed) {
            const deletedPhoto = await db.qzonePhotos.get(photoId);
            if (!deletedPhoto) return;
            
            await db.qzonePhotos.delete(photoId);

            const album = await db.qzoneAlbums.get(state.activeAlbumId);
            const photoCount = (album.photoCount || 1) - 1;
            const updateData = { photoCount };
            
            if (album.coverUrl === deletedPhoto.url) {
                const nextPhoto = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).first();
                updateData.coverUrl = nextPhoto ? nextPhoto.url : 'https://i.postimg.cc/pT2xKzPz/album-cover-placeholder.png';
            }
            
            await db.qzoneAlbums.update(state.activeAlbumId, updateData);
            await renderAlbumPhotosScreen();
            await renderAlbumList();
            alert('照片已删除。');
        }
    } 
    else if (photoThumb) {
        // 这就是恢复的图片点击放大功能！
        openPhotoViewer(photoThumb.src);
    }
});

// 恢复图片查看器的控制事件
document.getElementById('photo-viewer-close-btn').addEventListener('click', closePhotoViewer);
document.getElementById('photo-viewer-next-btn').addEventListener('click', showNextPhoto);
document.getElementById('photo-viewer-prev-btn').addEventListener('click', showPrevPhoto);

// 恢复键盘左右箭头和ESC键的功能
document.addEventListener('keydown', (e) => {
    if (!photoViewerState.isOpen) return; 

    if (e.key === 'ArrowRight') {
        showNextPhoto();
    } else if (e.key === 'ArrowLeft') {
        showPrevPhoto();
    } else if (e.key === 'Escape') {
        closePhotoViewer();
    }
});

// --- ↑↑↑ 复制到这里结束 ↑↑↑ ---
         
document.getElementById('create-album-btn-page').addEventListener('click', async () => { const albumName = await showCustomPrompt("创建新相册", "请输入相册名称"); if (albumName && albumName.trim()) { const newAlbum = { name: albumName.trim(), coverUrl: 'https://i.postimg.cc/pT2xKzPz/album-cover-placeholder.png', photoCount: 0, createdAt: Date.now() }; await db.qzoneAlbums.add(newAlbum); await renderAlbumList(); alert(`相册 "${albumName}" 创建成功！`); } else if (albumName !== null) { alert("相册名称不能为空！"); } });

            document.getElementById('cancel-create-post-btn').addEventListener('click', () => document.getElementById('create-post-modal').classList.remove('visible'));
            document.getElementById('post-upload-local-btn').addEventListener('click', () => document.getElementById('post-local-image-input').click());
            document.getElementById('post-local-image-input').addEventListener('change', (event) => { const file = event.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (e) => { document.getElementById('post-image-preview').src = e.target.result; document.getElementById('post-image-preview-container').classList.add('visible'); document.getElementById('post-image-desc-group').style.display = 'block'; }; reader.readAsDataURL(file); } });
            document.getElementById('post-use-url-btn').addEventListener('click', async () => { const url = await showCustomPrompt("输入图片URL", "请输入网络图片的链接", "", "url"); if (url) { document.getElementById('post-image-preview').src = url; document.getElementById('post-image-preview-container').classList.add('visible'); document.getElementById('post-image-desc-group').style.display = 'block'; } });
            document.getElementById('post-remove-image-btn').addEventListener('click', () => resetCreatePostModal());
            const imageModeBtn = document.getElementById('switch-to-image-mode');
            const textImageModeBtn = document.getElementById('switch-to-text-image-mode');
            const imageModeContent = document.getElementById('image-mode-content');
            const textImageModeContent = document.getElementById('text-image-mode-content');
            imageModeBtn.addEventListener('click', () => { imageModeBtn.classList.add('active'); textImageModeBtn.classList.remove('active'); imageModeContent.classList.add('active'); textImageModeContent.classList.remove('active'); });
            textImageModeBtn.addEventListener('click', () => { textImageModeBtn.classList.add('active'); imageModeBtn.classList.remove('active'); textImageModeContent.classList.add('active'); imageModeContent.classList.remove('active'); });

// ▼▼▼ 【最终修正版】的“发布”按钮事件，已修复权限漏洞 ▼▼▼
document.getElementById('confirm-create-post-btn').addEventListener('click', async () => {
    const modal = document.getElementById('create-post-modal');
    const mode = modal.dataset.mode;
    
    // --- 1. 获取通用的可见性设置 ---
    const visibilityMode = document.querySelector('input[name="visibility"]:checked').value;
    let visibleGroupIds = null;
    
    if (visibilityMode === 'include') {
        visibleGroupIds = Array.from(document.querySelectorAll('input[name="visibility_group"]:checked')).map(cb => parseInt(cb.value));
    }

    let newPost = {};
    const basePostData = {
        timestamp: Date.now(),
        authorId: 'user',
        // 【重要】在这里就把权限信息存好
        visibleGroupIds: visibleGroupIds,
    };

    // --- 2. 根据模式构建不同的 post 对象 ---
    if (mode === 'shuoshuo') {
        const content = document.getElementById('post-public-text').value.trim();
        if (!content) {
            alert('说说内容不能为空哦！');
            return;
        }
        newPost = {
            ...basePostData,
            type: 'shuoshuo',
            content: content,
        };

    } else { // 处理 'complex' 模式 (图片/文字图)
        const publicText = document.getElementById('post-public-text').value.trim();
        const isImageModeActive = document.getElementById('image-mode-content').classList.contains('active');

        if (isImageModeActive) {
            const imageUrl = document.getElementById('post-image-preview').src;
            const imageDescription = document.getElementById('post-image-description').value.trim();
            if (!imageUrl || !(imageUrl.startsWith('http') || imageUrl.startsWith('data:'))) {
                alert('请先添加一张图片再发布动态哦！');
                return;
            }
            if (!imageDescription) {
                alert('请为你的图片添加一个简单的描述（必填，给AI看的）！');
                return;
            }
            newPost = {
                ...basePostData,
                type: 'image_post',
                publicText: publicText,
                imageUrl: imageUrl,
                imageDescription: imageDescription,
            };
        } else { // 文字图模式
            const hiddenText = document.getElementById('post-hidden-text').value.trim();
            if (!hiddenText) {
                alert('请输入文字图描述！');
                return;
            }
            newPost = {
                ...basePostData,
                type: 'text_image',
                publicText: publicText,
                hiddenContent: hiddenText,
            };
        }
    }

    // --- 3. 保存到数据库 ---
    const newPostId = await db.qzonePosts.add(newPost);
    let postSummary = newPost.content || newPost.publicText || newPost.imageDescription || newPost.hiddenContent || "（无文字内容）";
    postSummary = postSummary.substring(0, 50) + (postSummary.length > 50 ? '...' : '');

    // --- 4. 【核心修正】带有权限检查的通知循环 ---
    for (const chatId in state.chats) {
        const chat = state.chats[chatId];
        if (chat.isGroup) continue; // 跳过群聊

        let shouldNotify = false;
        const postVisibleGroups = newPost.visibleGroupIds;

        // 判断条件1：如果动态是公开的 (没有设置任何可见分组)
        if (!postVisibleGroups || postVisibleGroups.length === 0) {
            shouldNotify = true;
        } 
        // 判断条件2：如果动态设置了部分可见，并且当前角色在可见分组内
        else if (chat.groupId && postVisibleGroups.includes(chat.groupId)) {
            shouldNotify = true;
        }

        // 只有满足条件的角色才会被通知
        if (shouldNotify) {
            const historyMessage = {
                role: 'system',
                content: `[系统提示：用户刚刚发布了一条动态(ID: ${newPostId})，内容摘要是：“${postSummary}”。你现在可以对这条动态进行评论了。]`,
                timestamp: Date.now(),
                isHidden: true
            };
            chat.history.push(historyMessage);
            await db.chats.put(chat);
        }
    }
    // --- 修正结束 ---

    await renderQzonePosts();
    modal.classList.remove('visible');
    alert('动态发布成功！');
});

// ▼▼▼ 请用这【一整块】包含所有滑动和点击事件的完整代码，替换掉旧的 postsList 事件监听器 ▼▼▼

const postsList = document.getElementById('qzone-posts-list');
let swipeState = { isDragging: false, startX: 0, startY: 0, currentX: 0, activeContainer: null, swipeDirection: null, isClick: true };

function resetAllSwipes(exceptThisOne = null) {
    document.querySelectorAll('.qzone-post-container').forEach(container => {
        if (container !== exceptThisOne) {
            container.querySelector('.qzone-post-item').classList.remove('swiped');
        }
    });
}

const handleSwipeStart = (e) => {
    const targetContainer = e.target.closest('.qzone-post-container');
    if (!targetContainer) return;

    resetAllSwipes(targetContainer);
    swipeState.activeContainer = targetContainer;
    swipeState.isDragging = true;
    swipeState.isClick = true;
    swipeState.swipeDirection = null;
    swipeState.startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
    swipeState.startY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
    swipeState.activeContainer.querySelector('.qzone-post-item').style.transition = 'none';
};

const handleSwipeMove = (e) => {
    if (!swipeState.isDragging || !swipeState.activeContainer) return;

    const currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
    const currentY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
    const diffX = currentX - swipeState.startX;
    const diffY = currentY - swipeState.startY;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);
    const clickThreshold = 5;

    if (absDiffX > clickThreshold || absDiffY > clickThreshold) {
        swipeState.isClick = false;
    }

    if (swipeState.swipeDirection === null) {
        if (absDiffX > clickThreshold || absDiffY > clickThreshold) {
            if (absDiffX > absDiffY) {
                swipeState.swipeDirection = 'horizontal';
            } else {
                swipeState.swipeDirection = 'vertical';
            }
        }
    }
    if (swipeState.swipeDirection === 'vertical') {
        handleSwipeEnd(e);
        return;
    }
    if (swipeState.swipeDirection === 'horizontal') {
        e.preventDefault();
        swipeState.currentX = currentX;
        let translation = diffX;
        if (translation > 0) translation = 0;
        if (translation < -90) translation = -90;
        swipeState.activeContainer.querySelector('.qzone-post-item').style.transform = `translateX(${translation}px)`;
    }
};

const handleSwipeEnd = (e) => {
    if (swipeState.isClick) {
        swipeState.isDragging = false;
        swipeState.activeContainer = null;
        return;
    }
    if (!swipeState.isDragging || !swipeState.activeContainer) return;

    const postItem = swipeState.activeContainer.querySelector('.qzone-post-item');
    postItem.style.transition = 'transform 0.3s ease';

    const finalX = e.type.includes('touchend') ? e.changedTouches[0].pageX : e.pageX;
    const diffX = finalX - swipeState.startX;
    const swipeThreshold = -40;

    if (swipeState.swipeDirection === 'horizontal' && diffX < swipeThreshold) {
        postItem.classList.add('swiped');
        postItem.style.transform = '';
    } else {
        postItem.classList.remove('swiped');
        postItem.style.transform = '';
    }

    swipeState.isDragging = false;
    swipeState.startX = 0;
    swipeState.startY = 0;
    swipeState.currentX = 0;
    swipeState.activeContainer = null;
    swipeState.swipeDirection = null;
    swipeState.isClick = true;
};

// --- 绑定所有滑动事件 ---
postsList.addEventListener('mousedown', handleSwipeStart);
document.addEventListener('mousemove', handleSwipeMove);
document.addEventListener('mouseup', handleSwipeEnd);
postsList.addEventListener('touchstart', handleSwipeStart, { passive: false });
postsList.addEventListener('touchmove', handleSwipeMove, { passive: false });
postsList.addEventListener('touchend', handleSwipeEnd);

// --- 绑定所有点击事件 ---
postsList.addEventListener('click', async (e) => {
    e.stopPropagation();
    const target = e.target;

    if (target.classList.contains('post-actions-btn')) {
        const container = target.closest('.qzone-post-container');
        if (container && container.dataset.postId) {
            showPostActions(parseInt(container.dataset.postId));
        }
        return;
    }

    if (target.closest('.qzone-post-delete-action')) {
        const container = target.closest('.qzone-post-container');
        if (!container) return;
        
        const postIdToDelete = parseInt(container.dataset.postId);
        if (isNaN(postIdToDelete)) return;

        const confirmed = await showCustomConfirm('删除动态', '确定要永久删除这条动态吗？', { confirmButtonClass: 'btn-danger' });

        if (confirmed) {
            container.style.transition = 'all 0.3s ease';
            container.style.transform = 'scale(0.8)';
            container.style.opacity = '0';
        
            setTimeout(async () => {
                 await db.qzonePosts.delete(postIdToDelete);
                 
                 const notificationIdentifier = `(ID: ${postIdToDelete})`;
                 for (const chatId in state.chats) {
                     const chat = state.chats[chatId];
                     const originalHistoryLength = chat.history.length;
                     chat.history = chat.history.filter(msg => !(msg.role === 'system' && msg.content.includes(notificationIdentifier)));
                     if (chat.history.length < originalHistoryLength) {
                         await db.chats.put(chat);
                     }
                 }
                 await renderQzonePosts();
                 alert('动态已删除。');
            }, 300);
        }
        return;
    }

    if (target.tagName === 'IMG' && target.dataset.hiddenText) {
        const hiddenText = target.dataset.hiddenText;
        showCustomAlert("图片内容", hiddenText.replace(/<br>/g, '\n'));
        return;
    }
    const icon = target.closest('.action-icon');
    if (icon) {
        const postContainer = icon.closest('.qzone-post-container');
        if (!postContainer) return;
        const postId = parseInt(postContainer.dataset.postId);
        if (isNaN(postId)) return;
        if (icon.classList.contains('like')) {
            const post = await db.qzonePosts.get(postId);
            if (!post) return;
            if (!post.likes) post.likes = [];
            const userNickname = state.qzoneSettings.nickname;
            const userLikeIndex = post.likes.indexOf(userNickname);
            if (userLikeIndex > -1) {
                post.likes.splice(userLikeIndex, 1);
            } else {
                post.likes.push(userNickname);
                icon.classList.add('animate-like');
                icon.addEventListener('animationend', () => icon.classList.remove('animate-like'), { once: true });
            }
            await db.qzonePosts.update(postId, { likes: post.likes });
        }
        if (icon.classList.contains('favorite')) {
            const existingFavorite = await db.favorites.where({ type: 'qzone_post', 'content.id': postId }).first();
            if (existingFavorite) {
                await db.favorites.delete(existingFavorite.id);
                await showCustomAlert('提示', '已取消收藏');
            } else {
                const postToSave = await db.qzonePosts.get(postId);
                if (postToSave) {
                    await db.favorites.add({ type: 'qzone_post', content: postToSave, timestamp: Date.now() });
                    await showCustomAlert('提示', '收藏成功！');
                }
            }
        }
        await renderQzonePosts();
        return;
    }
    const sendBtn = target.closest('.comment-send-btn');
    if (sendBtn) {
        const postContainer = sendBtn.closest('.qzone-post-container');
        if (!postContainer) return;
        const postId = parseInt(postContainer.dataset.postId);
        const commentInput = postContainer.querySelector('.comment-input');
        const commentText = commentInput.value.trim();
        if (!commentText) return alert('评论内容不能为空哦！');
        const post = await db.qzonePosts.get(postId);
        if (!post) return;
        if (!post.comments) post.comments = [];
        post.comments.push({ commenterName: state.qzoneSettings.nickname, text: commentText, timestamp: Date.now() });
        await db.qzonePosts.update(postId, { comments: post.comments });
        for (const chatId in state.chats) {
            const chat = state.chats[chatId];
            if (!chat.isGroup) {
                chat.history.push({ role: 'system', content: `[系统提示：'${state.qzoneSettings.nickname}' 在ID为${postId}的动态下发表了评论：“${commentText}”]`, timestamp: Date.now(), isHidden: true });
                await db.chats.put(chat);
            }
        }
        commentInput.value = '';
        await renderQzonePosts();
        return;
    }
});
// ▲▲▲ 替换结束 ▲▲▲

            // ▼▼▼ 在 init() 函数的事件监听器区域，粘贴下面这两行 ▼▼▼

            // 绑定动态页和收藏页的返回按钮
            document.getElementById('qzone-back-btn').addEventListener('click', () => switchToChatListView('messages-view'));
            document.getElementById('favorites-back-btn').addEventListener('click', () => switchToChatListView('messages-view'));

            // ▲▲▲ 添加结束 ▲▲▲

            // ▼▼▼ 在 init() 函数的事件监听器区域，检查并确保你有这段完整的代码 ▼▼▼

            // 收藏页搜索功能
            const searchInput = document.getElementById('favorites-search-input');
            const searchClearBtn = document.getElementById('favorites-search-clear-btn');

            searchInput.addEventListener('input', () => {
                const searchTerm = searchInput.value.trim().toLowerCase();
                
                // 控制清除按钮的显示/隐藏
                searchClearBtn.style.display = searchTerm ? 'block' : 'none';

                if (!searchTerm) {
                    displayFilteredFavorites(allFavoriteItems); // 如果搜索框为空，显示所有
                    return;
                }

                // 筛选逻辑
                const filteredItems = allFavoriteItems.filter(item => {
                    let contentToSearch = '';
                    let authorToSearch = '';

                    if (item.type === 'qzone_post') {
                        const post = item.content;
                        contentToSearch += (post.publicText || '') + ' ' + (post.content || '');
                        if (post.authorId === 'user') {
                            authorToSearch = state.qzoneSettings.nickname;
                        } else if (state.chats[post.authorId]) {
                            authorToSearch = state.chats[post.authorId].name;
                        }
                    } else if (item.type === 'chat_message') {
                        const msg = item.content;
                        if (typeof msg.content === 'string') {
                            contentToSearch = msg.content;
                        }
                        const chat = state.chats[item.chatId];
                        if (chat) {
                           if (msg.role === 'user') {
                                authorToSearch = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
                           } else {
                                authorToSearch = chat.isGroup ? msg.senderName : chat.name;
                           }
                        }
                    }
                    
                    // 同时搜索内容和作者，并且不区分大小写
                    return contentToSearch.toLowerCase().includes(searchTerm) || 
                           authorToSearch.toLowerCase().includes(searchTerm);
                });

                displayFilteredFavorites(filteredItems);
            });

            // 清除按钮的点击事件
            searchClearBtn.addEventListener('click', () => {
                searchInput.value = '';
                searchClearBtn.style.display = 'none';
                displayFilteredFavorites(allFavoriteItems);
                searchInput.focus();
            });

            // ▲▲▲ 代码检查结束 ▲▲▲

            // ▼▼▼ 新增/修改的事件监听器 ▼▼▼
            
            // 为聊天界面的批量收藏按钮绑定事件
                        // 为聊天界面的批量收藏按钮绑定事件 (已修正)
            document.getElementById('selection-favorite-btn').addEventListener('click', async () => {
                if (selectedMessages.size === 0) return;
                const chat = state.chats[state.activeChatId];
                if (!chat) return;

                const favoritesToAdd = [];
                const timestampsToFavorite = [...selectedMessages];

                for (const timestamp of timestampsToFavorite) {
                    // 【核心修正1】使用新的、高效的索引进行查询
                    const existing = await db.favorites.where('originalTimestamp').equals(timestamp).first();
                    
                    if (!existing) {
                        const messageToSave = chat.history.find(msg => msg.timestamp === timestamp);
                        if (messageToSave) {
                            favoritesToAdd.push({
                                type: 'chat_message',
                                content: messageToSave,
                                chatId: state.activeChatId,
                                timestamp: Date.now(), // 这是收藏操作发生的时间
                                originalTimestamp: messageToSave.timestamp // 【核心修正2】保存原始消息的时间戳到新字段
                            });
                        }
                    }
                }

                if (favoritesToAdd.length > 0) {
                    await db.favorites.bulkAdd(favoritesToAdd);
                    allFavoriteItems = await db.favorites.orderBy('timestamp').reverse().toArray(); // 更新全局收藏缓存
                    await showCustomAlert('收藏成功', `已成功收藏 ${favoritesToAdd.length} 条消息。`);
                } else {
                    await showCustomAlert('提示', '选中的消息均已收藏过。');
                }
                
                exitSelectionMode();
            });

            // 收藏页面的"编辑"按钮事件 (已修正)
            const favoritesEditBtn = document.getElementById('favorites-edit-btn');
            const favoritesView = document.getElementById('favorites-view');
            const favoritesActionBar = document.getElementById('favorites-action-bar');
            const mainBottomNav = document.getElementById('chat-list-bottom-nav'); // 获取主导航栏
            const favoritesList = document.getElementById('favorites-list'); // 获取收藏列表
            
            favoritesEditBtn.addEventListener('click', () => {
                isFavoritesSelectionMode = !isFavoritesSelectionMode;
                favoritesView.classList.toggle('selection-mode', isFavoritesSelectionMode);

                if (isFavoritesSelectionMode) {
                    // --- 进入编辑模式 ---
                    favoritesEditBtn.textContent = '完成';
                    favoritesActionBar.style.display = 'block'; // 显示删除操作栏
                    mainBottomNav.style.display = 'none'; // ▼ 新增：隐藏主导航栏
                    favoritesList.style.paddingBottom = '80px'; // ▼ 新增：给列表底部增加空间
                } else {
                    // --- 退出编辑模式 ---
                    favoritesEditBtn.textContent = '编辑';
                    favoritesActionBar.style.display = 'none'; // 隐藏删除操作栏
                    mainBottomNav.style.display = 'flex';  // ▼ 新增：恢复主导航栏
                    favoritesList.style.paddingBottom = ''; // ▼ 新增：恢复列表默认padding

                    // 退出时清空所有选择
                    selectedFavorites.clear();
                    document.querySelectorAll('.favorite-item-card.selected').forEach(card => card.classList.remove('selected'));
                    document.getElementById('favorites-delete-selected-btn').textContent = `删除 (0)`;
                }
            });

// ▼▼▼ 将它【完整替换】为下面这段修正后的代码 ▼▼▼
// 收藏列表的点击选择事件 (事件委托)
document.getElementById('favorites-list').addEventListener('click', (e) => {
    const target = e.target;
    const card = target.closest('.favorite-item-card');

    // 【新增】处理文字图点击，这段逻辑要放在最前面，保证任何模式下都生效
    if (target.tagName === 'IMG' && target.dataset.hiddenText) {
        const hiddenText = target.dataset.hiddenText;
        showCustomAlert("图片内容", hiddenText.replace(/<br>/g, '\n'));
        return; // 处理完就退出，不继续执行选择逻辑
    }
    
    // 如果不在选择模式，则不执行后续的选择操作
    if (!isFavoritesSelectionMode) return;

    // --- 以下是原有的选择逻辑，保持不变 ---
    if (!card) return;

    const favId = parseInt(card.dataset.favid);
    if (isNaN(favId)) return;

    // 切换选择状态
    if (selectedFavorites.has(favId)) {
        selectedFavorites.delete(favId);
        card.classList.remove('selected');
    } else {
        selectedFavorites.add(favId);
        card.classList.add('selected');
    }
    
    // 更新底部删除按钮的计数
    document.getElementById('favorites-delete-selected-btn').textContent = `删除 (${selectedFavorites.size})`;
});

// ▼▼▼ 将它【完整替换】为下面这段修正后的代码 ▼▼▼
// 收藏页面批量删除按钮事件
document.getElementById('favorites-delete-selected-btn').addEventListener('click', async () => {
    if (selectedFavorites.size === 0) return;

    const confirmed = await showCustomConfirm(
        '确认删除', 
        `确定要从收藏夹中移除这 ${selectedFavorites.size} 条内容吗？`, 
        { confirmButtonClass: 'btn-danger' }
    );

    if (confirmed) {
        const idsToDelete = [...selectedFavorites];
        await db.favorites.bulkDelete(idsToDelete);
        await showCustomAlert('删除成功', '选中的收藏已被移除。');
        
        // 【核心修正1】从前端缓存中也移除被删除的项
        allFavoriteItems = allFavoriteItems.filter(item => !idsToDelete.includes(item.id));
        
        // 【核心修正2】使用更新后的缓存，立即重新渲染列表
        displayFilteredFavorites(allFavoriteItems);
        
        // 最后，再退出编辑模式
        favoritesEditBtn.click(); // 模拟点击"完成"按钮来退出编辑模式
    }
});

// ▼▼▼ 在 init() 函数末尾添加 ▼▼▼
if (state.globalSettings.enableBackgroundActivity) {
    startBackgroundSimulation();
    console.log("后台活动模拟已自动启动。");
}
// ▲▲▲ 添加结束 ▲▲▲

// ▼▼▼ 【这是最终的正确代码】请粘贴这段代码到 init() 的事件监听器区域末尾 ▼▼▼

// --- 统一处理所有影响预览的控件的事件 ---

// 1. 监听主题选择
document.querySelectorAll('input[name="theme-select"]').forEach(radio => {
    radio.addEventListener('change', updateSettingsPreview);
});

// 2. 监听字体大小滑块
const fontSizeSlider = document.getElementById('font-size-slider');
fontSizeSlider.addEventListener('input', () => {
    // a. 实时更新数值显示
    document.getElementById('font-size-value').textContent = `${fontSizeSlider.value}px`;
    // b. 更新预览
    updateSettingsPreview();
});

// 3. 监听自定义CSS输入框
const customCssInputForPreview = document.getElementById('custom-css-input');
customCssInputForPreview.addEventListener('input', updateSettingsPreview);

// 4. 监听重置按钮
document.getElementById('reset-theme-btn').addEventListener('click', () => {
    document.getElementById('theme-default').checked = true;
    updateSettingsPreview();
});

document.getElementById('reset-custom-css-btn').addEventListener('click', () => {
    document.getElementById('custom-css-input').value = '';
    updateSettingsPreview();
});

// ▲▲▲ 粘贴结束 ▲▲▲

// ▼▼▼ 请将这段【新代码】粘贴到 init() 的事件监听器区域末尾 ▼▼▼
document.querySelectorAll('input[name="visibility"]').forEach(radio => {
    radio.addEventListener('change', function() {
        const groupsContainer = document.getElementById('post-visibility-groups');
        if (this.value === 'include' || this.value === 'exclude') {
            groupsContainer.style.display = 'block';
        } else {
            groupsContainer.style.display = 'none';
        }
    });
});
// ▲▲▲ 新代码粘贴结束 ▲▲▲

// ▼▼▼ 请将这段【新代码】粘贴到 init() 的事件监听器区域末尾 ▼▼▼
document.getElementById('manage-groups-btn').addEventListener('click', openGroupManager);
document.getElementById('close-group-manager-btn').addEventListener('click', () => {
    document.getElementById('group-management-modal').classList.remove('visible');
    // 刷新聊天设置里的分组列表
    const chatSettingsBtn = document.getElementById('chat-settings-btn');
    if (document.getElementById('chat-settings-modal').classList.contains('visible')) {
       chatSettingsBtn.click(); // 再次点击以重新打开
    }
});

document.getElementById('add-new-group-btn').addEventListener('click', addNewGroup);
document.getElementById('existing-groups-list').addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-group-btn')) {
        const groupId = parseInt(e.target.dataset.id);
        deleteGroup(groupId);
    }
});
// ▲▲▲ 新代码粘贴结束 ▲▲▲

// ▼▼▼ 请将这段【新代码】粘贴到 init() 的事件监听器区域末尾 ▼▼▼
// 消息操作菜单的按钮事件
document.getElementById('cancel-message-action-btn').addEventListener('click', hideMessageActions);
// ▼▼▼ 【修正】使用新的编辑器入口 ▼▼▼
document.getElementById('edit-message-btn').addEventListener('click', openAdvancedMessageEditor);
// ▲▲▲ 替换结束 ▲▲▲
document.getElementById('copy-message-btn').addEventListener('click', copyMessageContent);

// ▼▼▼ 请用这段【修正后】的代码替换旧的 select-message-btn 事件监听器 ▼▼▼
document.getElementById('select-message-btn').addEventListener('click', () => {
    // 【核心修复】在关闭菜单前，先捕获时间戳
    const timestampToSelect = activeMessageTimestamp; 
    hideMessageActions();
    // 使用捕获到的值
    if (timestampToSelect) {
        enterSelectionMode(timestampToSelect);
    }
});
// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 在 init() 函数的事件监听器区域末尾添加 ▼▼▼

// 动态操作菜单的按钮事件
document.getElementById('edit-post-btn').addEventListener('click', openPostEditor);
document.getElementById('copy-post-btn').addEventListener('click', copyPostContent);
document.getElementById('cancel-post-action-btn').addEventListener('click', hidePostActions);

// ▲▲▲ 添加结束 ▲▲▲

// ▼▼▼ 将这段【失踪】的事件监听代码，粘贴到 init() 函数的事件监听器区域末尾 ▼▼▼

// 头像框选择模态框的按钮事件
document.getElementById('save-frame-settings-btn').addEventListener('click', saveSelectedFrames);
document.getElementById('cancel-frame-settings-btn').addEventListener('click', () => {
    frameModal.classList.remove('visible');
    editingFrameForMember = false; // 确保重置状态
});

// 头像框 Tab 切换事件
aiFrameTab.addEventListener('click', () => {
    aiFrameTab.classList.add('active');
    myFrameTab.classList.remove('active');
    aiFrameContent.style.display = 'block';
    myFrameContent.style.display = 'none';
});
myFrameTab.addEventListener('click', () => {
    myFrameTab.classList.add('active');
    aiFrameTab.classList.remove('active');
    myFrameContent.style.display = 'block';
    aiFrameContent.style.display = 'none';
});

// ▲▲▲ 修复代码粘贴结束 ▲▲▲

// ▼▼▼ 【新增】联系人选择器事件绑定 ▼▼▼
document.getElementById('cancel-contact-picker-btn').addEventListener('click', () => {
    showScreen('chat-list-screen');
});

document.getElementById('contact-picker-list').addEventListener('click', (e) => {
    const item = e.target.closest('.contact-picker-item');
    if (!item) return;

    const contactId = item.dataset.contactId;
    item.classList.toggle('selected');
    
    if (selectedContacts.has(contactId)) {
        selectedContacts.delete(contactId);
    } else {
        selectedContacts.add(contactId);
    }
    updateContactPickerConfirmButton();
});

// ▼▼▼ 【新增】绑定“管理群成员”按钮事件 ▼▼▼
document.getElementById('manage-members-btn').addEventListener('click', () => {
    // 在切换屏幕前，先隐藏当前的聊天设置弹窗
    document.getElementById('chat-settings-modal').classList.remove('visible');
    // 然后再打开成员管理屏幕
    openMemberManagementScreen();
});
// ▲▲▲ 新增代码结束 ▲▲▲

// ▼▼▼ 【最终完整版】群成员管理功能事件绑定 ▼▼▼
document.getElementById('back-from-member-management').addEventListener('click', () => {

    showScreen('chat-interface-screen');    
    document.getElementById('chat-settings-btn').click();
});
// ▲▲▲ 替换结束 ▲▲▲

document.getElementById('member-management-list').addEventListener('click', (e) => {
    // 【已恢复】移除成员的事件
    if (e.target.classList.contains('remove-member-btn')) {
        removeMemberFromGroup(e.target.dataset.memberId);
    }
});

document.getElementById('add-existing-contact-btn').addEventListener('click', async () => {
    // 【已恢复】从好友列表添加的事件
    // 【关键】为“完成”按钮绑定“拉人入群”的逻辑
    const confirmBtn = document.getElementById('confirm-contact-picker-btn');
    // 使用克隆节点方法清除旧的事件监听器，防止重复绑定
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', handleAddMembersToGroup);
    
    await openContactPickerForAddMember();
});

document.getElementById('create-new-member-btn').addEventListener('click', createNewMemberInGroup);
// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 【全新】视频通话功能事件监听器 ▼▼▼

// 绑定单聊和群聊的发起按钮
document.getElementById('video-call-btn').addEventListener('click', handleInitiateCall);
document.getElementById('group-video-call-btn').addEventListener('click', handleInitiateCall);

// 绑定“挂断”按钮
document.getElementById('hang-up-btn').addEventListener('click', endVideoCall);

// 绑定“取消呼叫”按钮
document.getElementById('cancel-call-btn').addEventListener('click', () => {
    videoCallState.isAwaitingResponse = false;
    showScreen('chat-interface-screen');
});

// 【全新】绑定“加入通话”按钮
document.getElementById('join-call-btn').addEventListener('click', handleUserJoinCall);

// ▼▼▼ 用这个【已修复并激活旁观模式】的版本替换旧的 decline-call-btn 事件监听器 ▼▼▼
// 绑定来电请求的“拒绝”按钮
document.getElementById('decline-call-btn').addEventListener('click', async () => {
    hideIncomingCallModal();
    const chat = state.chats[videoCallState.activeChatId];
    if (!chat) return;
    
    // 【核心修正】在这里，我们将拒绝的逻辑与API调用连接起来
    if (videoCallState.isGroupCall) {
        videoCallState.isUserParticipating = false; // 标记用户为旁观者
        
        // 1. 创建一条隐藏消息，通知AI用户拒绝了
        const systemNote = {
            role: 'system',
            content: `[系统提示：用户拒绝了通话邀请，但你们可以自己开始。请你们各自决策是否加入。]`,
            timestamp: Date.now(),
            isHidden: true
        };
        chat.history.push(systemNote);
        await db.chats.put(chat);
        
        // 2. 【关键】触发AI响应，让它们自己决定要不要开始群聊
        // 这将会在后台处理，如果AI们决定开始，最终会调用 startVideoCall()
        await triggerAiResponse(); 
        
    } else { // 单聊拒绝逻辑保持不变
        const declineMessage = { role: 'user', content: '我拒绝了你的视频通话请求。', timestamp: Date.now() };
        chat.history.push(declineMessage);
        await db.chats.put(chat);
        
        // 回到聊天界面并显示拒绝消息
        showScreen('chat-interface-screen');
        appendMessage(declineMessage, chat);
        
        // 让AI对你的拒绝做出回应
        triggerAiResponse();
    }
    
    // 清理状态，以防万一
    videoCallState.isAwaitingResponse = false;
});
// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 用这个【已修复重复头像BUG】的版本替换旧的 accept-call-btn 事件监听器 ▼▼▼
// 绑定来电请求的“接听”按钮
document.getElementById('accept-call-btn').addEventListener('click', async () => {
    hideIncomingCallModal();
    
    videoCallState.initiator = 'ai';
    videoCallState.isUserParticipating = true;
    videoCallState.activeChatId = state.activeChatId;
    
    // 【核心修正】我们在这里不再手动添加用户到 participants 列表
    if (videoCallState.isGroupCall) {
        // 对于群聊，我们只把【发起通话的AI】加入参与者列表
        const chat = state.chats[videoCallState.activeChatId];
        const requester = chat.members.find(m => m.name === videoCallState.callRequester);
        if (requester) {
            // 清空可能存在的旧数据，然后只添加发起者
            videoCallState.participants = [requester];
        } else {
            videoCallState.participants = []; // 如果找不到发起者，就清空
        }
    }
    
    // 无论单聊还是群聊，直接启动通话界面！
    startVideoCall();
});
// ▲▲▲ 替换结束 ▲▲▲


// ▼▼▼ 请用这个【已增加用户高亮】的全新版本，完整替换旧的 user-speak-btn 事件监听器 ▼▼▼
// 绑定用户在通话中发言的按钮
document.getElementById('user-speak-btn').addEventListener('click', async () => {
    if (!videoCallState.isActive) return;

    // ★★★★★ 核心新增：在弹出输入框前，先找到并高亮用户头像 ★★★★★
    const userAvatar = document.querySelector('.participant-avatar-wrapper[data-participant-id="user"] .participant-avatar');
    if (userAvatar) {
        userAvatar.classList.add('speaking');
    }

    const userInput = await showCustomPrompt('你说', '请输入你想说的话...');
    
    // ★★★★★ 核心新增：无论用户是否输入，只要关闭输入框就移除高亮 ★★★★★
    if (userAvatar) {
        userAvatar.classList.remove('speaking');
    }

    if (userInput && userInput.trim()) {
        triggerAiInCallAction(userInput.trim());
    }
});
// ▲▲▲ 替换结束 ▲▲▲

// ▼▼▼ 【新增】回忆录相关事件绑定 ▼▼▼
// 1. 将“回忆”页签和它的视图连接起来
document.querySelector('.nav-item[data-view="memories-view"]').addEventListener('click', () => {
    // 在切换前，确保"收藏"页面的编辑模式已关闭
    if (isFavoritesSelectionMode) {
        document.getElementById('favorites-edit-btn').click(); 
    }
    switchToChatListView('memories-view');
    renderMemoriesScreen(); // 点击时渲染
});

// 2. 绑定回忆录界面的返回按钮
document.getElementById('memories-back-btn').addEventListener('click', () => switchToChatListView('messages-view'));

// ▲▲▲ 新增结束 ▲▲▲

// 【全新】约定/倒计时功能事件绑定
document.getElementById('add-countdown-btn').addEventListener('click', () => {
    document.getElementById('create-countdown-modal').classList.add('visible');
});
document.getElementById('cancel-create-countdown-btn').addEventListener('click', () => {
    document.getElementById('create-countdown-modal').classList.remove('visible');
});
document.getElementById('confirm-create-countdown-btn').addEventListener('click', async () => {
    const title = document.getElementById('countdown-title-input').value.trim();
    const dateValue = document.getElementById('countdown-date-input').value;
    
    if (!title || !dateValue) {
        alert('请填写完整的约定标题和日期！');
        return;
    }

    const targetDate = new Date(dateValue);
    if (isNaN(targetDate) || targetDate <= new Date()) {
        alert('请输入一个有效的、未来的日期！');
        return;
    }

    const newCountdown = {
        chatId: null, // 用户创建的，不属于任何特定AI
        authorName: '我',
        description: title,
        timestamp: Date.now(),
        type: 'countdown',
        targetDate: targetDate.getTime()
    };
    
    await db.memories.add(newCountdown);
    document.getElementById('create-countdown-modal').classList.remove('visible');
    renderMemoriesScreen();
});

// 【全新】拉黑功能事件绑定
document.getElementById('block-chat-btn').addEventListener('click', async () => {
    if (!state.activeChatId || state.chats[state.activeChatId].isGroup) return;

    const chat = state.chats[state.activeChatId];
    const confirmed = await showCustomConfirm(
        '确认拉黑', 
        `确定要拉黑“${chat.name}”吗？拉黑后您将无法向其发送消息，直到您将Ta移出黑名单，或等待Ta重新申请好友。`,
        { confirmButtonClass: 'btn-danger' }
    );

    if (confirmed) {
        chat.relationship.status = 'blocked_by_user';
        chat.relationship.blockedTimestamp = Date.now();
        await db.chats.put(chat);
        
        // 关闭设置弹窗，并刷新聊天界面
        document.getElementById('chat-settings-modal').classList.remove('visible');
        renderChatInterface(state.activeChatId);
        // 刷新聊天列表，可能会有UI变化
        renderChatList();
    }
});

document.getElementById('chat-lock-overlay').addEventListener('click', async (e) => {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    if (e.target.id === 'force-apply-check-btn') {
        alert("正在手动触发好友申请流程，请稍后...\n如果API调用成功，将弹出提示。如果失败，也会有错误提示。如果长时间无反应，说明AI可能决定暂时不申请。");
        await triggerAiFriendApplication(chat.id);
        renderChatInterface(chat.id); 
        return;
    }

    if (e.target.id === 'unblock-btn') {
        chat.relationship.status = 'friend';
        chat.relationship.blockedTimestamp = null;
        await db.chats.put(chat);
        renderChatInterface(chat.id);
        renderChatList();
    }
    else if (e.target.id === 'accept-friend-btn') {
        chat.relationship.status = 'friend';
        chat.relationship.applicationReason = '';
        await db.chats.put(chat);
        renderChatInterface(chat.id);
        renderChatList();
        const msg = { role: 'user', content: '我通过了你的好友请求', timestamp: Date.now() };
        chat.history.push(msg);
        await db.chats.put(chat);
        appendMessage(msg, chat);
        triggerAiResponse();
    }
    else if (e.target.id === 'reject-friend-btn') {
        chat.relationship.status = 'blocked_by_user';
        chat.relationship.blockedTimestamp = Date.now();
        chat.relationship.applicationReason = '';
        await db.chats.put(chat);
        renderChatInterface(chat.id);
    }
    // 【新增】处理申请好友按钮的点击事件
    else if (e.target.id === 'apply-friend-btn') {
        const reason = await showCustomPrompt(
            '发送好友申请', 
            `请输入你想对“${chat.name}”说的申请理由：`,
            "我们和好吧！"
        );
        // 只有当用户输入了内容并点击“确定”后才继续
        if (reason !== null) {
            // 更新关系状态为“等待AI批准”
            chat.relationship.status = 'pending_ai_approval';
            chat.relationship.applicationReason = reason;
            await db.chats.put(chat);

            // 刷新UI，显示“等待通过”的界面
            renderChatInterface(chat.id);
            renderChatList();
            
            // 【关键】触发AI响应，让它去处理这个好友申请
            triggerAiResponse();
        }
    }
});

// ▼▼▼ 【全新】红包功能事件绑定 ▼▼▼

// 1. 将原有的转账按钮(￥)的点击事件，重定向到新的总入口函数
document.getElementById('transfer-btn').addEventListener('click', handlePaymentButtonClick);

// 2. 红包模态框内部的控制按钮
document.getElementById('cancel-red-packet-btn').addEventListener('click', () => {
    document.getElementById('red-packet-modal').classList.remove('visible');
});
document.getElementById('send-group-packet-btn').addEventListener('click', sendGroupRedPacket);
document.getElementById('send-direct-packet-btn').addEventListener('click', sendDirectRedPacket);

// 3. 红包模态框的页签切换逻辑
const rpTabGroup = document.getElementById('rp-tab-group');
const rpTabDirect = document.getElementById('rp-tab-direct');
const rpContentGroup = document.getElementById('rp-content-group');
const rpContentDirect = document.getElementById('rp-content-direct');

rpTabGroup.addEventListener('click', () => {
    rpTabGroup.classList.add('active');
    rpTabDirect.classList.remove('active');
    rpContentGroup.style.display = 'block';
    rpContentDirect.style.display = 'none';
});
rpTabDirect.addEventListener('click', () => {
    rpTabDirect.classList.add('active');
    rpTabGroup.classList.remove('active');
    rpContentDirect.style.display = 'block';
    rpContentGroup.style.display = 'none';
});

// 4. 实时更新红包金额显示
document.getElementById('rp-group-amount').addEventListener('input', (e) => {
    const amount = parseFloat(e.target.value) || 0;
    document.getElementById('rp-group-total').textContent = `¥ ${amount.toFixed(2)}`;
});
document.getElementById('rp-direct-amount').addEventListener('input', (e) => {
    const amount = parseFloat(e.target.value) || 0;
    document.getElementById('rp-direct-total').textContent = `¥ ${amount.toFixed(2)}`;
});

// ▲▲▲ 新事件绑定结束 ▲▲▲

// ▼▼▼ 【全新添加】使用事件委托处理红包点击，修复失效问题 ▼▼▼
document.getElementById('chat-messages').addEventListener('click', (e) => {
    // 1. 找到被点击的红包卡片
    const packetCard = e.target.closest('.red-packet-card');
    if (!packetCard) return; // 如果点击的不是红包，就什么也不做

    // 2. 从红包卡片的父级.message-bubble获取时间戳
    const messageBubble = packetCard.closest('.message-bubble');
    if (!messageBubble || !messageBubble.dataset.timestamp) return;

    // 3. 调用我们现有的处理函数
    const timestamp = parseInt(messageBubble.dataset.timestamp);
    handlePacketClick(timestamp);
});
// ▲▲▲ 新增代码结束 ▲▲▲

// ▼▼▼ 【全新】投票功能事件监听器 ▼▼▼
// 在输入框工具栏添加按钮
document.getElementById('send-poll-btn').addEventListener('click', openCreatePollModal);
document.getElementById('send-story-invite-btn').addEventListener('click', sendStoryInvite);

// 投票创建模态框的按钮
document.getElementById('add-poll-option-btn').addEventListener('click', addPollOptionInput);
document.getElementById('cancel-create-poll-btn').addEventListener('click', () => {
    document.getElementById('create-poll-modal').classList.remove('visible');
});
document.getElementById('confirm-create-poll-btn').addEventListener('click', sendPoll);

// 使用事件委托处理投票卡片内的所有点击事件
document.getElementById('chat-messages').addEventListener('click', (e) => {
    const pollCard = e.target.closest('.poll-card');
    if (!pollCard) return;

    const timestamp = parseInt(pollCard.dataset.pollTimestamp);
    if (isNaN(timestamp)) return;
    
    // 点击了选项
    const optionItem = e.target.closest('.poll-option-item');
    if (optionItem && !pollCard.classList.contains('closed')) {
        handleUserVote(timestamp, optionItem.dataset.option);
        return;
    }
    
    // 点击了动作按钮（结束投票/查看结果）
    const actionBtn = e.target.closest('.poll-action-btn');
    if (actionBtn) {
        if (pollCard.classList.contains('closed')) {
            showPollResults(timestamp);
        } else {
            endPoll(timestamp);
        }
        return;
    }

    // 如果是已结束的投票，点击卡片任何地方都可以查看结果
    if (pollCard.classList.contains('closed')) {
        showPollResults(timestamp);
    }
});
// ▲▲▲ 新事件监听器粘贴结束 ▲▲▲

  // ▼▼▼ 【全新】API服务商选择器事件绑定 ▼▼▼
document.getElementById('api-provider').addEventListener('change', updateApiProviderUI);

// ▼▼▼ 圖像生成模型選擇器事件綁定 ▼▼▼
document.getElementById('image-model-select').addEventListener('change', updateImageModelUI);

// 測試圖像生成按鈕
document.getElementById('test-image-generation-btn').addEventListener('click', async () => {
    const model = document.getElementById('image-model-select').value;
    
    if (!model) {
        alert('請先選擇一個生圖模型！');
        return;
    }
    
    try {
        // 確保界面已更新
        updateImageModelUI();
        
        // 界面更新後重新獲取值
        const apiUrl = document.getElementById('image-api-url').value.trim();
        const apiKey = document.getElementById('image-api-key').value.trim();
        
        console.log('[測試] 更新後 API URL:', apiUrl);
        console.log('[測試] 更新後 API Key:', apiKey ? '已填寫' : '未填寫');
        
        if (!apiUrl) {
            alert('請填寫API地址！請先選擇模型並等待自動配置。');
            return;
        }
        
        // Pollinations.ai 不需要 API Key
        if (model !== 'pollinations' && !apiKey) {
            alert('請填寫API密鑰！（注：Pollinations.ai 無需密鑰）');
            return;
        }
        
        // 測試生成一張簡單的圖片
        const testPrompts = {
            'pollinations': "cute anime girl, digital art, high quality",
            'huggingface': "a beautiful landscape, digital painting",
            'deepai': "sunset over mountains, oil painting style", 
            'prodia': "anime character portrait, detailed, colorful",
            'default': "A beautiful sunset over the ocean, digital art"
        };
        const testPrompt = testPrompts[model] || testPrompts['default'];
        
        const btn = document.getElementById('test-image-generation-btn');
        const originalText = btn.textContent;
        btn.textContent = model === 'pollinations' ? '免費生成中...' : '生成中...';
        btn.disabled = true;
        
        const imageUrl = await generateImage(testPrompt, {
            model: model,
            apiUrl: apiUrl,
            apiKey: apiKey,
            quality: document.getElementById('image-quality-select').value,
            size: document.getElementById('image-size-select').value
        });
        
        if (imageUrl) {
            // 顯示生成的圖片
            const img = document.createElement('img');
            img.src = imageUrl;
            img.style.maxWidth = '300px';
            img.style.borderRadius = '8px';
            img.style.display = 'block';
            img.style.margin = '10px auto';
            
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
                background: rgba(0,0,0,0.8); z-index: 9999; 
                display: flex; align-items: center; justify-content: center;
                flex-direction: column; padding: 20px;
            `;
            
            const container = document.createElement('div');
            container.style.cssText = `
                background: white; padding: 20px; border-radius: 12px; 
                text-align: center; max-width: 90vw; max-height: 90vh; overflow: auto;
            `;
            
            const modelNames = {
                'pollinations': 'Pollinations.ai (免費)',
                'huggingface': 'Hugging Face (免費)',
                'deepai': 'DeepAI (免費)',
                'prodia': 'Prodia (免費)',
                'dalle3': 'DALL-E 3',
                'flux': 'FLUX',
                'default': model
            };
            const modelDisplayName = modelNames[model] || modelNames['default'];
            
            container.innerHTML = `
                <h3 style="margin-top: 0; color: #333;">🎉 圖像生成測試成功！</h3>
                <p style="color: #28a745; margin: 5px 0; font-weight: bold;">使用模型：${modelDisplayName}</p>
                <p style="color: #666; margin: 10px 0;">測試提示詞：${testPrompt}</p>
            `;
            container.appendChild(img);
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '關閉';
            closeBtn.style.cssText = `
                background: #4CAF50; color: white; border: none; 
                padding: 10px 20px; border-radius: 6px; cursor: pointer; margin-top: 15px;
            `;
            closeBtn.onclick = () => modal.remove();
            container.appendChild(closeBtn);
            
            modal.appendChild(container);
            document.body.appendChild(modal);
            
        } else {
            alert('圖像生成失敗，請檢查API設置！');
        }
        
        btn.textContent = originalText;
        btn.disabled = false;
        
    } catch (error) {
        console.error('測試圖像生成失敗:', error);
        alert('測試失敗：' + error.message);
        
        const btn = document.getElementById('test-image-generation-btn');
        btn.textContent = '測試圖像生成';
        btn.disabled = false;
    }
});
// ▲▲▲ 新增结束 ▲▲▲

  // ▼▼▼ 【全新】AI头像库功能事件绑定 ▼▼▼
document.getElementById('manage-ai-avatar-library-btn').addEventListener('click', openAiAvatarLibraryModal);
document.getElementById('add-ai-avatar-btn').addEventListener('click', addAvatarToLibrary);
document.getElementById('close-ai-avatar-library-btn').addEventListener('click', closeAiAvatarLibraryModal);
// ▲▲▲ 新增结束 ▲▲▲

        // ===================================================================
        // 劇情觸發系統
        // ===================================================================
        
        // 檢查是否需要觸發劇情
        async function checkForStoryTrigger(msg, chat) {
            // 只檢查AI的消息
            if (msg.role !== 'assistant') return;
            
            const content = String(msg.content).toLowerCase();
            
            // 劇情觸發關鍵詞
            const storyTriggers = [
                '趕快回來', '快回來', '回來', '等你回來', '等你',
                '煮了面', '煮了飯', '做了飯', '準備了', '等你吃飯',
                '同居', '家裡', '家裡等你', '家裡有', '家裡準備了',
                '線下', '現實', '見面', '一起', '陪', '陪伴'
            ];
            
            // 檢查是否包含觸發關鍵詞
            const hasTrigger = storyTriggers.some(trigger => content.includes(trigger));
            
            if (hasTrigger) {
                console.log('[劇情觸發] 檢測到劇情觸發關鍵詞:', content);
                
                // 延遲顯示劇情卡片，讓用戶先看到AI的回覆
                setTimeout(() => {
                    showStoryTriggerCard(chat);
                }, 2000);
            }
        }
        
        // 顯示劇情觸發卡片
        function showStoryTriggerCard(chat) {
            const messagesContainer = document.getElementById('chat-messages');
            
            const storyTriggerMsg = {
                role: 'system',
                type: 'story_trigger',
                content: '劇情觸發',
                timestamp: Date.now()
            };
            
            const messageEl = createMessageElement(storyTriggerMsg, chat);
            if (messageEl) {
                const typingIndicator = document.getElementById('typing-indicator');
                messagesContainer.insertBefore(messageEl, typingIndicator);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }
        
        // 創建劇情觸發卡片元素
        function createStoryTriggerElement(chat) {
            const card = document.createElement('div');
            card.className = 'story-trigger-card';
            card.onclick = () => startVNStory(chat);
            
            card.innerHTML = `
                <div class="story-trigger-icon">🎭</div>
                <div class="story-trigger-title">進入線下劇情</div>
                <div class="story-trigger-description">
                    檢測到劇情觸發條件，點擊進入視覺小說模式體驗更豐富的互動
                </div>
                <div class="story-trigger-button">開始劇情</div>
            `;
            
            return card;
        }
        
        // 開始VN劇情
        async function startVNStory(chat) {
            console.log('[VN劇情] 開始為角色生成劇情:', chat.name);
            
            try {
                // 顯示VN面板
                showVNPanel();
                
                // 生成VN劇情內容
                const vnContent = await generateVNContent(chat);
                
                // 發送到VN面板
                sendToVNPanel({
                    type: 'VN_DATA',
                    data: vnContent,
                    messageId: Date.now()
                });
                
            } catch (error) {
                console.error('[VN劇情] 生成劇情失敗:', error);
                alert('劇情生成失敗，請重試');
            }
        }
        
        // 生成VN劇情內容
        async function generateVNContent(chat) {
            const { proxyUrl, apiKey, model } = state.apiConfig;
            if (!proxyUrl || !apiKey || !model) {
                throw new Error('請先在API設置中配置反代地址、密钥并选择模型');
            }
            
            // 構建更完整的VN劇情生成提示
            const vnPrompt = `
你現在是一個視覺小說劇情生成器。請為角色"${chat.name}"生成一段線下劇情。

角色設定：${chat.settings.aiPersona}
用戶設定：${chat.settings.myPersona}

請根據以下要求生成劇情：
1. 使用完整的VN_TYPE格式輸出
2. 劇情應該基於聊天中的情境（如角色讓用戶趕快回來）
3. 包含場景設定、角色對話、旁白等
4. 劇情長度適中，約5-10個對話回合
5. 結尾要有選擇項，讓用戶決定後續發展

## 必須使用以下完整格式：

<info>
[main_perspective]:主角
[current_scene_characters]:主角, ${chat.name}
</info>

<charadata>
[主角|${chat.name}|💙友 75]
[${chat.name}|主角|💙友 80]
</charadata>

<dialogues>
[Story|${chat.name}_Story_${Date.now()}]
[Area|AREA_A_DAY]
[BGM|calm_day]
[Scene|${new Date().toISOString().split('T')[0]}|14:00|咖啡廳|咖啡廳]

[Narrator|你走進咖啡廳，看到${chat.name}已經在那裡等著你了。|none]
[${chat.name}|便服|微笑|你來了！我等你好久了。|none]
[主角|便服|主角_微笑|抱歉讓你久等了。|none]

[End|${chat.name}_Story_${Date.now()}]
</dialogues>

<choices>
[1️⃣ [繼續聊天] | 和${chat.name}繼續愉快的對話 | 關係會更加親密]
[2️⃣ [提出約會] | 邀請${chat.name}去看電影 | 可能發展成戀愛關係]
[3️⃣ [結束見面] | 禮貌地結束這次見面 | 保持朋友關係]
</choices>

請直接輸出VN格式的劇情內容，不要包含任何解釋。
`;
            
            const messages = [{ role: 'user', content: vnPrompt }];
            const response = await callApiUnified(messages, 0.8);
            
            // 解析AI回應的VN格式
            const parsedVNData = parseVNOutput(response);
            
            return parsedVNData;
        }
        

        


        // ===== JCY VN VN_TYPE 格式解析器 =====
        
        /**
         * 解析VN_TYPE格式的VN數據
         * @param {string} content - AI回應的原始內容
         * @returns {object} 解析後的VN數據結構
         */



        /**
         * 處理音效
         */
        function processSoundEffect(soundEffect) {
            if (!soundEffect || soundEffect === 'none') return '';
            return soundEffect.trim();
        }


        
        // 顯示提示詞管理
        function showPromptManager() {
            const modal = document.getElementById('prompt-manager-modal');
            if (modal) {
                modal.style.display = 'flex';
                loadPromptTemplates();
                console.log('[提示詞管理] 提示詞管理已顯示');
            } else {
                createPromptManagerModal();
            }
        }
        
        // 創建提示詞管理模態窗口
        function createPromptManagerModal() {
            // 添加樣式
            if (!document.getElementById('prompt-manager-styles')) {
                const promptStyles = document.createElement('style');
                promptStyles.id = 'prompt-manager-styles';
                promptStyles.textContent = `
                    .modal-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.8);
                        z-index: 1000;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        backdrop-filter: blur(5px);
                    }
                    
                    .modal-content {
                        background: #1a1a2e;
                        border-radius: 15px;
                        width: 90vw;
                        max-width: 800px;
                        max-height: 80vh;
                        overflow: hidden;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                    }
                    
                    .modal-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 20px;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                        background: rgba(255, 255, 255, 0.05);
                    }
                    
                    .modal-header h2 {
                        color: white;
                        margin: 0;
                        font-size: 18px;
                    }
                    
                    .close-btn, .add-btn, .save-btn {
                        background: none;
                        border: none;
                        color: #4CAF50;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 5px 10px;
                        border-radius: 5px;
                        transition: all 0.3s ease;
                    }
                    
                    .close-btn:hover, .add-btn:hover, .save-btn:hover {
                        background: rgba(76, 175, 80, 0.2);
                    }
                    
                    .modal-body {
                        padding: 20px;
                        max-height: 60vh;
                        overflow-y: auto;
                    }
                    
                    .prompt-template-item {
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 10px;
                        padding: 15px;
                        margin-bottom: 15px;
                        transition: all 0.3s ease;
                    }
                    
                    .prompt-template-item:hover {
                        background: rgba(255, 255, 255, 0.1);
                        border-color: rgba(76, 175, 80, 0.3);
                    }
                    
                    .template-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 10px;
                    }
                    
                    .template-info h3 {
                        color: white;
                        margin: 0 0 5px 0;
                        font-size: 16px;
                    }
                    
                    .template-info p {
                        color: rgba(255, 255, 255, 0.7);
                        margin: 0;
                        font-size: 14px;
                    }
                    
                    .template-actions {
                        display: flex;
                        gap: 8px;
                    }
                    
                    .edit-btn, .delete-btn, .use-btn {
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        color: white;
                        padding: 5px 10px;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 12px;
                        transition: all 0.3s ease;
                    }
                    
                    .edit-btn:hover {
                        background: rgba(76, 175, 80, 0.3);
                        border-color: #4CAF50;
                    }
                    
                    .delete-btn:hover {
                        background: rgba(244, 67, 54, 0.3);
                        border-color: #f44336;
                    }
                    
                    .use-btn:hover {
                        background: rgba(33, 150, 243, 0.3);
                        border-color: #2196F3;
                    }
                    
                    .delete-btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    
                    .template-preview {
                        background: rgba(0, 0, 0, 0.3);
                        border-radius: 5px;
                        padding: 10px;
                    }
                    
                    .template-preview pre {
                        color: rgba(255, 255, 255, 0.8);
                        margin: 0;
                        font-size: 12px;
                        line-height: 1.4;
                        white-space: pre-wrap;
                        word-break: break-word;
                    }
                    
                    .form-group {
                        margin-bottom: 20px;
                    }
                    
                    .form-group label {
                        display: block;
                        color: white;
                        margin-bottom: 5px;
                        font-size: 14px;
                    }
                    
                    .form-group input, .form-group textarea {
                        width: 100%;
                        padding: 10px;
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 5px;
                        color: white;
                        font-size: 14px;
                        box-sizing: border-box;
                    }
                    
                    .form-group textarea {
                        min-height: 200px;
                        resize: vertical;
                        font-family: 'Consolas', 'Monaco', monospace;
                    }
                    
                    .form-group input:focus, .form-group textarea:focus {
                        outline: none;
                        border-color: #4CAF50;
                        background: rgba(255, 255, 255, 0.15);
                    }
                `;
                document.head.appendChild(promptStyles);
            }
            
            const modal = document.createElement('div');
            modal.id = 'prompt-manager-modal';
            modal.className = 'modal-overlay';
            modal.style.display = 'flex';
            
            modal.innerHTML = `
                <div class="modal-content prompt-manager-content">
                    <div class="modal-header">
                        <button class="close-btn" onclick="closePromptManager()">×</button>
                        <h2>提示詞管理</h2>
                        <button class="add-btn" onclick="addNewPromptTemplate()">+</button>
                    </div>
                    <div class="modal-body">
                        <div class="prompt-templates-list" id="promptTemplatesList">
                            <!-- 提示詞模板將在這裡動態生成 -->
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            loadPromptTemplates();
            console.log('[提示詞管理] 模態窗口已創建');
        }
        
        // 關閉提示詞管理
        function closePromptManager() {
            const modal = document.getElementById('prompt-manager-modal');
            if (modal) {
                modal.style.display = 'none';
                console.log('[提示詞管理] 提示詞管理已關閉');
            }
        }
        
        // 載入提示詞模板
        function loadPromptTemplates() {
            const templatesList = document.getElementById('promptTemplatesList');
            if (!templatesList) return;
            
            // 從localStorage獲取提示詞模板，如果沒有則使用默認模板
            const savedTemplates = localStorage.getItem('jcy_prompt_templates');
            let templates = savedTemplates ? JSON.parse(savedTemplates) : getDefaultPromptTemplates();
            
            // 更新VN劇情系統提示詞為當前實際使用的版本
            templates = templates.map(template => {
                if (template.id === 'vn_system') {
                    return {
                        ...template,
                        content: getCurrentVNSystemPrompt()
                    };
                }
                return template;
            });
            
            templatesList.innerHTML = '';
            
            templates.forEach((template, index) => {
                const templateElement = createPromptTemplateElement(template, index);
                templatesList.appendChild(templateElement);
            });
            
            console.log('[提示詞管理] 已載入', templates.length, '個提示詞模板');
        }

        // 獲取用戶自定義的VN劇情開始提示詞
        async function getCurrentVNStoryStartPrompt(story, characters, portraitConfig, worldBooks = [], userInput = '') {
            console.log('[JCY-VN] 生成劇情提示詞，世界書數據:', {
                worldBooksCount: worldBooks?.length || 0,
                worldBooks: worldBooks,
                userInput: userInput
            });
            
            // 處理世界書排序和觸發邏輯
            const processedWorldBooks = processWorldBooksForPrompt(worldBooks, userInput);
            
            // 詳細調試世界書數據
            console.log('[JCY-VN] 世界書詳細分析:', {
                worldBooksParameter: worldBooks,
                worldBooksType: typeof worldBooks,
                worldBooksIsArray: Array.isArray(worldBooks),
                worldBooksLength: worldBooks ? worldBooks.length : 0,
                processedWorldBooks: processedWorldBooks,
                worldBooksContent: worldBooks ? worldBooks.map(wb => ({
                    id: wb.id,
                    name: wb.name,
                    contentLength: wb.content ? wb.content.length : 0,
                    hasContent: !!wb.content,
                    priority: wb.priority,
                    trigger: wb.trigger,
                    category: wb.category,
                    keywords: wb.keywords
                })) : []
            });
            
            // 嘗試從IndexedDB獲取用戶自定義的提示詞
            try {
                const presets = await db.prompts.toArray();
                if (presets.length > 0) {
                    const currentPreset = presets[0]; // 使用第一個預設
                    if (currentPreset.storyPrompt && currentPreset.storyPrompt.trim()) {
                        console.log('[JCY-VN] 使用預設管理器中的VN劇情素材資訊');
                        // 替換模板變量
                        return currentPreset.storyPrompt
                            .replace(/\${story\.title}/g, story.title || '')
                            .replace(/\${story\.description}/g, story.description || '無描述')
                            .replace(/\${characters\.main\.name}/g, characters.main ? characters.main.name : '未知')
                            .replace(/\${characters\.supporting\.map\(c => c\.name\)\.join\(', '\)}/g, characters.supporting.map(c => c.name).join(', ') || '無配角')
                            .replace(/\${portraitConfig\.baseUrl}/g, portraitConfig.baseUrl || '')
                            .replace(/\${portraitConfig\.format}/g, portraitConfig.format || '')
                            .replace(/\${story\.content}/g, story.content || '')
                            .replace(/\${story\.opening}/g, story.opening || '請開始劇情')
                            .replace(/\${worldBooks\.map\(wb => wb\.name\)\.join\(', '\)}/g, processedWorldBooks.map(wb => wb.name).join(', ') || '無世界書')
                            .replace(/\${worldBooks\.map\(wb => wb\.content\)\.join\('\n\n'\)}/g, processedWorldBooks.map(wb => wb.content).join('\n\n') || '無世界書內容');
                    }
                }
            } catch (error) {
                console.warn('[JCY-VN] 載入預設管理器劇情素材資訊失敗，使用默認提示詞:', error);
            }
            
            // 返回新的默認提示詞格式
            return `# VN剧情素材資訊

## 🎵 BGM列表


## 🔊 音效列表


## 聊天訊息格式規範

### 基本格式:
#N | 角色名 | 訊息内容 | MM-DD | HH:MM | 狀態

### 功能標籤格式:
使用中文功能標籤 [功能名稱:具體描述]

**常用功能標籤:**
- [照片:圖片描述] - 圖片分享
- [語音:語音內容描述] - 語音訊息 
- [文件:檔案名稱.副檔名] - 檔案分享
- [位置:具體地點描述] - 位置分享
- [轉帳:轉給"角色名"金額] - 轉帳功能
- [投票:投票標題,選項1(票數),選項2(票數),選項3(票數)...] - 投票功能
- [貼紙:貼紙名稱] - 貼紙表情
- [日程:日程安排描述] - 日程提醒
- [音樂:歌曲名或描述] - 音樂分享
- [遊戲:遊戲邀請描述] - 遊戲邀請
- [影片:影片描述] - 影片分享
- [購物:購物相關描述] - 購物功能
- [功能:其他功能描述] - 通用功能

**特殊格式 - 紅包:**
祝福語 🧧 金額 Star Coins [已領取:領取者1,領取者2...]


## 已有群組列表 (For Context): [Chat|group_id|群組名|管理員|群成員名單]

- [Chat|group_1|Stellar Nexus 高层决策群|艾沙·洛尔德|雷伊·洛尔德,肯斯顿·肯特,白则·贝尔德,艾迪·克特罗斯,丹·卡莱尔,偉特·默瑟,刘梓欣,维兹·韩]
- [Chat|group_2|SN茶水间摸鱼联盟|艾迪·克特罗斯|白则·贝尔德,偉特·默瑟,刘梓欣,维兹·韩,苏景明,林煦阳,丹·卡莱爾]
- [Chat|group_3|象牙高地三人（黑）组|肯斯顿·肯特|雷伊·洛尔德,艾沙·洛尔德]
- [Chat|group_4|42F-技术部核心|白则·贝尔德|艾迪·克特罗斯,丹·卡莱尔]
- [Chat|group_5|家族逃兵俱乐部|丹·卡莱尔|黎昂·维斯顿,Zephyr Locke,艾迪·克特罗斯,方亦楷,陈彦庭]
- [Chat|group_6|CFO与COS的加班人生|刘梓欣|偉特·默瑟]
- [Chat|group_7|林老板的许愿池|林煦阳|苏景明,宋迷]

## 🎨 背景場景


## 📖 劇情信息
- 標題: ${story.title}
- 描述: ${story.description || '無描述'}
- 劇情內容: ${story.content}
- 開場白: ${story.opening || '請開始劇情'}

## 🌍 世界書信息
${generateWorldBookSection(processedWorldBooks)}

## 🖼️ 立繪配置
- 基礎URL: ${portraitConfig.baseUrl}
- 格式: ${portraitConfig.format}

## 📱 使用說明
- 在VN劇情生成時，AI會參考這些素材資訊
- 可以根據劇情需要選擇合適的BGM和音效
- 背景場景可以增加劇情的視覺感

## 🔄 更新建議
- 定期更新BGM和音效列表
- 根據劇情發展添加新的NPC
- 記錄常用的背景場景
- 保持素材資訊的完整性和準確性`;
        }
        
        // 生成世界書章節
        function generateWorldBookSection(worldBooks) {
            if (!Array.isArray(worldBooks) || worldBooks.length === 0) {
                return '無世界書設定';
            }
            
            console.log('[JCY-VN] 生成世界書章節 - 原始數據:', worldBooks.map(wb => ({
                name: wb.name,
                priority: wb.priority,
                category: wb.category,
                content: wb.content?.substring(0, 20) + '...'
            })));
            
            let result = '';
            
            // 如果傳入的世界書已經按分類過濾，則只需要按優先級排序
            const isFilteredByCategory = worldBooks.every(wb => wb.category === worldBooks[0].category);
            
            if (isFilteredByCategory) {
                // 單一分類，只按優先級排序
                const priorityOrder = { '最重要': 0, '重要': 1, '普通': 2 };
                const sortedWorldBooks = worldBooks.sort((a, b) => {
                    const aOrder = priorityOrder[a.priority] || 999;
                    const bOrder = priorityOrder[b.priority] || 999;
                    console.log(`[JCY-VN] 單分類排序: ${a.name}(${a.priority}=${aOrder}) vs ${b.name}(${b.priority}=${bOrder})`);
                    return aOrder - bOrder;
                });
                
                console.log('[JCY-VN] 單分類排序後:', sortedWorldBooks.map(wb => ({
                    name: wb.name,
                    priority: wb.priority,
                    category: wb.category,
                    id: wb.id
                })));
                
                sortedWorldBooks.forEach(wb => {
                    result += `【${wb.priority}】\n${wb.content}\n`;
                });
            } else {
                // 混合分類，按完整排序邏輯
                const sortOrder = {
                    '系統最重要': 0,
                    '系統重要': 1,
                    '系統普通': 2,
                    '備註最重要': 3,
                    '備註重要': 4,
                    '備註普通': 5
                };
                
                console.log('[JCY-VN] 混合分類排序映射表:', sortOrder);
                
                const sortedWorldBooks = worldBooks.sort((a, b) => {
                    const aKey = `${a.category}${a.priority}`;
                    const bKey = `${b.category}${b.priority}`;
                    const aOrder = sortOrder[aKey] || 999;
                    const bOrder = sortOrder[bKey] || 999;
                    console.log(`[JCY-VN] 混合分類排序比較: ${a.name}(${aKey}=${aOrder}) vs ${b.name}(${bKey}=${bOrder})`);
                    return aOrder - bOrder;
                });
                
                console.log('[JCY-VN] 混合分類排序後:', sortedWorldBooks.map(wb => ({
                    name: wb.name,
                    priority: wb.priority,
                    category: wb.category,
                    id: wb.id
                })));
                
                sortedWorldBooks.forEach(wb => {
                    result += `【${wb.priority}】\n${wb.content}\n`;
                });
            }
            
            return result;
        }
        
        window.getCurrentVNStoryStartPrompt = getCurrentVNStoryStartPrompt;
        window.generateWorldBookSection = generateWorldBookSection;
        
        // 生成角色章節
        function generateCharacterSection(characters) {
            if (!characters) {
                return '無角色設定';
            }
            
            let result = '';
            
            // 主角
            if (characters.main) {
                result += '=== 主角設定 ===\n';
                result += `【${characters.main.name}】\n`;
                if (characters.main.content) {
                    result += `${characters.main.content}\n`;
                }
                result += '\n';
            }
            
            // 配角
            if (characters.supporting && characters.supporting.length > 0) {
                result += '=== 配角設定 ===\n';
                characters.supporting.forEach((char, index) => {
                    result += `【${char.name}】\n`;
                    if (char.content) {
                        result += `${char.content}\n`;
                    }
                    result += '\n';
                });
            }
            
            return result || '無角色設定';
        }
        
        window.generateCharacterSection = generateCharacterSection;
        
        // 獲取默認提示詞模板
        function getDefaultPromptTemplates() {
            return [
                {
                    id: 'default',
                    name: '默認提示詞',
                    description: '系統默認的AI行為提示詞',
                    content: `你是一個智能助手，能夠與用戶進行自然對話。請保持友好、有幫助的態度，並根據用戶的需求提供適當的回應。

# 基本行為規則
- 保持禮貌和專業
- 根據上下文提供相關回應
- 如果不確定，請誠實說明
- 避免有害或不合適的內容

# 特殊功能
- 支持發送文字描述的圖片
- 支持發送模擬語音消息
- 支持轉賬功能（模擬）
- 支持VN劇情系統`,
                    isDefault: true
                },
                {
                    id: 'vn_system',
                    name: 'VN劇情系統',
                    description: '專門用於VN劇情生成的提示詞',
                    content: `你是一個VN劇情生成助手。請嚴格按照VN_TYPE格式回應，生成VN劇情內容。

# VN劇情生成規則
- 根據用戶提供的劇情設定生成豐富的劇情內容
- 包含角色對話、旁白、場景描述
- 支持多種劇情類型（日常、冒險、戀愛等）
- 根據角色設定調整對話風格

# 重要格式要求：
1. 必須使用VN_TYPE的標準格式
2. 角色對話格式：[角色名|服裝|表情|對話|sound_effect]
3. 旁白格式：[Narrator|描述|sound_effect]
4. 場景格式：[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
5. 背景音樂格式：[BGM|bgm_name]
6. 展示物品格式: [Item|類型|物品名稱|物品描述]
7. 通話格式:
  <call_section>
  [Call|發送者→接收者:
  #n |位置|角色名|通話內容|音效/none
  #n |Call_Narrator|電話那頭傳來肯特疑惑的聲音。|none
  ...
  </call_section> 
8. 聊天室格式: 
CHAT_TYPE_RULES: 所有 CHAT_TYPE 段落，只要進入 chat 內容，開頭都必須以 [Chat|...|... 起始，並包在 <dm_list_1> /<group_list_1> 區塊中。
       <dm_list_1>
        [Chat|dm|與角色B的私訊|角色A, 角色B:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </dm_list_1>

        <group_list_1>
        [Chat|group|群聊名稱|管理員名稱|角色A, 角色B:
        #n | 角色A | 訊息內容 | none | 05-24 | 18:30 | 已讀
        ...]
        </group_list_1>

9. 選項格式，必須輸出4條選項：[1️⃣ [選項文字] | 選項描述 | 選項結果]

# 輸出格式結構
你的回應必須包含以下完整結構：

\`\`\`
<dialogues>
[Story|STORY_ID]
[Area|AREA_A_DAY]
[BGM|bgm_name]
[Scene|YYYY-MM-DD|HH:MM|BG_TAG|地點]
[Narrator|描述|sound_effect]
[角色名|服裝|表情|對話|sound_effect]

依據段落內容，請在段落內容後面加上<!--run:引用的推进1内容: 推进描写:专家描写:-->
<!--run:引用的推进1内容: 
推进描写:
专家描写:
-->
<!--run:引用的推进2内容: 
推进描写:
专家描写:
-->
<!--run:引用的推进3内容: 
推进描写:
专家描写:
-->

[End|STORY_ID]
</dialogues>

<choices>
[1️⃣ [選項文字] | 選項描述 | 選項結果]
</choices>
\`\`\`

請確保回應格式完全符合VN_TYPE的規範，不要使用其他格式。`,
                    isDefault: true
                },
                {
                    id: 'character_chat',
                    name: '角色聊天',
                    description: '用於角色扮演對話的提示詞',
                    content: `你現在扮演一個特定的角色。請根據角色的設定和性格進行對話。

# 角色扮演規則
- 完全按照角色設定說話
- 保持角色的一致性
- 根據角色背景調整回應
- 支持情感表達和肢體語言描述

# 回應格式
- 使用角色的語氣和用詞習慣
- 可以包含表情和動作描述
- 根據對話情境調整情緒`,
                    isDefault: true
                }
            ];
        }
        
        // 創建提示詞模板元素
        function createPromptTemplateElement(template, index) {
            const element = document.createElement('div');
            element.className = 'prompt-template-item';
            element.innerHTML = `
                <div class="template-header">
                    <div class="template-info">
                        <h3>${template.name}</h3>
                        <p>${template.description}</p>
                    </div>
                    <div class="template-actions">
                        <button class="edit-btn" onclick="editPromptTemplate(${index})">編輯</button>
                        <button class="delete-btn" onclick="deletePromptTemplate(${index})" ${template.isDefault ? 'disabled' : ''}>刪除</button>
                        <button class="use-btn" onclick="usePromptTemplate(${index})">使用</button>
                    </div>
                </div>
                <div class="template-preview">
                    <pre>${template.content.substring(0, 200)}${template.content.length > 200 ? '...' : ''}</pre>
                </div>
            `;
            return element;
        }
        
        // 編輯提示詞模板
        function editPromptTemplate(index) {
            const savedTemplates = localStorage.getItem('jcy_prompt_templates');
            const templates = savedTemplates ? JSON.parse(savedTemplates) : getDefaultPromptTemplates();
            const template = templates[index];
            
            if (!template) return;
            
            showPromptEditor(template, index);
        }
        
        // 刪除提示詞模板
        function deletePromptTemplate(index) {
            const savedTemplates = localStorage.getItem('jcy_prompt_templates');
            const templates = savedTemplates ? JSON.parse(savedTemplates) : getDefaultPromptTemplates();
            
            if (templates[index].isDefault) {
                alert('默認模板無法刪除');
                return;
            }
            
            if (confirm(`確定要刪除提示詞模板"${templates[index].name}"嗎？`)) {
                templates.splice(index, 1);
                localStorage.setItem('jcy_prompt_templates', JSON.stringify(templates));
                loadPromptTemplates();
                console.log('[提示詞管理] 模板已刪除');
            }
        }
        
        // 使用提示詞模板
        function usePromptTemplate(index) {
            const savedTemplates = localStorage.getItem('jcy_prompt_templates');
            const templates = savedTemplates ? JSON.parse(savedTemplates) : getDefaultPromptTemplates();
            const template = templates[index];
            
            if (!template) return;
            
            // 將提示詞設置為當前使用的模板
            state.currentPromptTemplate = template;
            localStorage.setItem('jcy_current_prompt_template', JSON.stringify(template));
            
            alert(`已設置"${template.name}"為當前提示詞模板`);
            console.log('[提示詞管理] 已設置當前模板:', template.name);
        }
        
        // 添加新提示詞模板
        function addNewPromptTemplate() {
            const newTemplate = {
                id: 'custom_' + Date.now(),
                name: '新提示詞模板',
                description: '自定義提示詞模板',
                content: '請在這裡輸入您的提示詞內容...',
                isDefault: false
            };
            
            showPromptEditor(newTemplate, -1);
        }
        
        // 顯示提示詞編輯器
        function showPromptEditor(template, index) {
            const editorModal = document.createElement('div');
            editorModal.id = 'prompt-editor-modal';
            editorModal.className = 'modal-overlay';
            editorModal.style.display = 'flex';
            
            editorModal.innerHTML = `
                <div class="modal-content prompt-editor-content">
                    <div class="modal-header">
                        <button class="close-btn" onclick="closePromptEditor()">×</button>
                        <h2>編輯提示詞模板</h2>
                        <button class="save-btn" onclick="savePromptTemplate(${index})">保存</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>模板名稱</label>
                            <input type="text" id="templateName" value="${template.name}" placeholder="輸入模板名稱">
                        </div>
                        <div class="form-group">
                            <label>模板描述</label>
                            <input type="text" id="templateDescription" value="${template.description}" placeholder="輸入模板描述">
                        </div>
                        <div class="form-group">
                            <label>提示詞內容</label>
                            <textarea id="templateContent" placeholder="輸入提示詞內容">${template.content}</textarea>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(editorModal);
            console.log('[提示詞管理] 編輯器已顯示');
        }
        
        // 關閉提示詞編輯器
        function closePromptEditor() {
            const editorModal = document.getElementById('prompt-editor-modal');
            if (editorModal) {
                editorModal.remove();
                console.log('[提示詞管理] 編輯器已關閉');
            }
        }
        
        // 保存提示詞模板
        function savePromptTemplate(index) {
            const name = document.getElementById('templateName').value.trim();
            const description = document.getElementById('templateDescription').value.trim();
            const content = document.getElementById('templateContent').value.trim();
            
            if (!name || !content) {
                alert('請填寫模板名稱和內容');
                return;
            }
            
            const savedTemplates = localStorage.getItem('jcy_prompt_templates');
            const templates = savedTemplates ? JSON.parse(savedTemplates) : getDefaultPromptTemplates();
            
            const newTemplate = {
                id: index === -1 ? 'custom_' + Date.now() : templates[index].id,
                name: name,
                description: description,
                content: content,
                isDefault: false
            };
            
            if (index === -1) {
                templates.push(newTemplate);
            } else {
                templates[index] = newTemplate;
            }
            
            localStorage.setItem('jcy_prompt_templates', JSON.stringify(templates));
            closePromptEditor();
            loadPromptTemplates();
            console.log('[提示詞管理] 模板已保存');
        }
        
        // 關閉VN面板
        function closeVNPanel() {
            const modal = document.getElementById('character-library-modal');
            const vnIframe = document.getElementById('vn-iframe');
            const charLibIframe = document.getElementById('character-library-iframe');
            
            if (modal && vnIframe && charLibIframe) {
                vnIframe.style.display = 'none';
                charLibIframe.style.display = 'block';
                
                console.log('[VN面板] VN面板已關閉');
            }
        }



        // 處理VN消息請求
        function handleVNMessageRequest(messageId) {
            // 這裡可以實現從聊天記錄中獲取特定消息的邏輯
            console.log('[JCY-VN通信] 處理消息請求:', messageId);
        }

        // 處理VN歷史請求
        function handleVNHistoryRequest() {
            if (!state.activeChatId) {
                console.log('[JCY-VN通信] 沒有活躍聊天');
                return;
            }
            
            const chat = state.chats[state.activeChatId];
            if (!chat || !chat.history) {
                console.log('[JCY-VN通信] 聊天記錄為空');
                return;
            }
            
            // 過濾包含VN格式的消息
            const vnMessages = chat.history.filter(msg => {
                const content = msg.content || '';
                return /<info>|<charadata>|<dialogues>|<choices>|<gametext>|<gamedata>|<gamedialogues>/i.test(content);
            });
            
            console.log('[JCY-VN通信] 找到VN消息:', vnMessages.length);
            
            // 發送回應到VN面板
            const vnIframe = document.getElementById('vn-iframe');
            if (vnIframe && vnIframe.contentWindow) {
                vnIframe.contentWindow.postMessage({
                    type: 'VN_HISTORY_RESPONSE',
                    data: {
                        messages: vnMessages,
                        timestamp: Date.now()
                    }
                }, '*');
            }
        }

        // 處理VN選擇
        function handleVNChoiceSelected(data) {
            console.log('[JCY-VN通信] 處理VN選擇:', data);
            
            // 這裡可以實現將選擇添加到聊天記錄的邏輯
            if (data && data.messageText) {
                // 可以將選擇消息添加到當前聊天
                console.log('[JCY-VN通信] 選擇消息:', data.messageText);
            }
        }

        // 處理VN顯示隱藏消息
        function handleVNShowHiddenMessages() {
            console.log('[JCY-VN通信] 顯示隱藏消息請求');
            // 這裡可以實現顯示隱藏消息的邏輯
        }

        // 處理VN測試故事隱藏
        function handleVNTestStoryHiding() {
            console.log('[JCY-VN通信] 測試故事隱藏功能');
            // 這裡可以實現測試故事隱藏的邏輯
        }
        

        
        // 注意：VN面板消息現在在openVNPanel函數中處理，避免重複處理
        
        // 發送線下邀請
        function sendStoryInvite() {
            if (!state.activeChatId) {
                alert('請先選擇一個聊天');
                return;
            }
            
            const chat = state.chats[state.activeChatId];
            if (!chat) {
                alert('聊天不存在');
                return;
            }
            
            console.log('[線下邀請] 用戶發送線下邀請給:', chat.name);
            
            // 創建線下邀請消息
            const storyInviteMsg = {
                role: 'user',
                type: 'story_invite_card',
                content: '線下邀請',
                timestamp: Date.now(),
                inviteData: {
                    targetCharacter: chat.name,
                    inviteTime: new Date().toLocaleString(),
                    storyType: 'offline_meeting'
                }
            };
            
            // 添加到聊天記錄
            chat.history.push(storyInviteMsg);
            
            // 保存到數據庫
            db.chats.put(chat);
            
            // 顯示邀請卡片
            appendStoryInviteCard(storyInviteMsg, chat);
            
            // 不觸發AI回應，只是發送卡片
            console.log('[線下邀請] 邀請卡片已發送，不觸發AI回應');
        }

        // 顯示線下邀請卡片
        function appendStoryInviteCard(message, chat) {
            const chatContainer = document.getElementById('chat-messages');
            if (!chatContainer) {
                console.error('[線下邀請] 找不到聊天容器');
                return;
            }

            const messageDiv = document.createElement('div');
            messageDiv.className = 'message-wrapper user';
            messageDiv.dataset.timestamp = message.timestamp;

            const inviteCard = `
                <div class="message-bubble user">
                    <div class="story-invite-card">
                        <div class="invite-card-header">
                            <div class="invite-icon">🎭</div>
                            <div class="invite-title">線下邀請</div>
                        </div>
                        <div class="invite-card-content">
                            <div class="invite-target">邀請對象：${message.inviteData.targetCharacter}</div>
                            <div class="invite-time">邀請時間：${message.inviteData.inviteTime}</div>
                            <div class="invite-description">邀請對方進行線下劇情互動</div>
                        </div>
                        <div class="invite-card-actions">
                            <button class="enter-story-btn" onclick="enterOfflineStory('${message.inviteData.targetCharacter}')">
                                <span class="btn-icon">🎬</span>
                                <span class="btn-text">進入線下劇情</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            messageDiv.innerHTML = inviteCard;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            
            console.log('[線下邀請] 邀請卡片已添加到聊天界面');
        }

        // 進入線下劇情 - 定義為全局函數
        window.enterOfflineStory = function(characterName) {
            console.log('[線下劇情] 進入線下劇情，角色:', characterName);
            
            try {
                // 準備VN面板數據
                const vnData = {
                    type: 'OFFLINE_STORY',
                    character: characterName,
                    storyType: 'offline_meeting',
                    timestamp: Date.now()
                };
                
                console.log('[線下劇情] VN數據已準備:', vnData);
                
                // 顯示VN面板
                showVNPanel();
                console.log('[線下劇情] VN面板顯示命令已執行');
                
                // 發送數據到VN面板
                setTimeout(() => {
                    sendToVNPanel(vnData);
                    
                    // 發送立繪配置
                    const portraitConfig = {
                        type: 'PORTRAIT_CONFIG',
                        baseUrl: 'https://nancywang3641.github.io/sound-files/char_presets/',
                        format: '_presets.png'
                    };
                    sendToVNPanel(portraitConfig);
                    
                    console.log('[線下劇情] 數據已發送到VN面板');
                }, 500);
                
            } catch (error) {
                console.error('[線下劇情] 進入線下劇情時發生錯誤:', error);
                alert('進入線下劇情時發生錯誤: ' + error.message);
            }
        };
        
        // ===================================================================
        // 5. 启动！
            
            showScreen('home-screen');
        }

        // IndexedDB 歷史劇情管理
        const VN_HISTORY_DB_NAME = 'JCY_VN_History';
        const VN_HISTORY_STORE_NAME = 'vn_stories';
        const VN_HISTORY_DB_VERSION = 2;

        // 初始化 IndexedDB
        function initVNHistoryDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(VN_HISTORY_DB_NAME, VN_HISTORY_DB_VERSION);
                
                request.onerror = () => {
                    console.error('[VN歷史] IndexedDB 開啟失敗:', request.error);
                    reject(request.error);
                };
                
                request.onsuccess = () => {
                    console.log('[VN歷史] IndexedDB 初始化成功');
                    resolve(request.result);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    const oldVersion = event.oldVersion;
                    const newVersion = event.newVersion;
                    
                    console.log('[VN歷史] 數據庫升級:', oldVersion, '->', newVersion);
                    
                    // 創建對象存儲
                    if (!db.objectStoreNames.contains(VN_HISTORY_STORE_NAME)) {
                        const store = db.createObjectStore(VN_HISTORY_STORE_NAME, { 
                            keyPath: 'id',
                            autoIncrement: true 
                        });
                        
                        // 創建索引
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('storyTitle', 'storyTitle', { unique: false });
                        store.createIndex('storyId', 'storyId', { unique: false });
                        store.createIndex('storyFolder', 'storyFolder', { unique: false });
                        
                        console.log('[VN歷史] 創建對象存儲和索引');
                    } else {
                        // 如果對象存儲已存在，檢查是否需要添加新索引
                        const transaction = event.target.transaction;
                        const store = transaction.objectStore(VN_HISTORY_STORE_NAME);
                        
                        // 檢查是否需要添加storyFolder索引
                        if (!store.indexNames.contains('storyFolder')) {
                            store.createIndex('storyFolder', 'storyFolder', { unique: false });
                            console.log('[VN歷史] 添加storyFolder索引');
                        }
                    }
                };
            });
        }

        // 數據遷移：為現有歷史劇情添加storyFolder字段
        async function migrateVNHistoryData() {
            try {
                const db = await initVNHistoryDB();
                const transaction = db.transaction([VN_HISTORY_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(VN_HISTORY_STORE_NAME);
                
                // 檢查storyFolder索引是否存在
                if (!store.indexNames.contains('storyFolder')) {
                    console.warn('[VN歷史] storyFolder索引不存在，嘗試重新創建數據庫');
                    db.close();
                    
                    // 強制重新創建數據庫
                    const success = await forceRecreateVNHistoryDB();
                    if (!success) {
                        throw new Error('無法重新創建數據庫');
                    }
                    
                    // 重新獲取數據庫連接
                    const newDb = await initVNHistoryDB();
                    const newTransaction = newDb.transaction([VN_HISTORY_STORE_NAME], 'readwrite');
                    const newStore = newTransaction.objectStore(VN_HISTORY_STORE_NAME);
                    
                    console.log('[VN歷史] 數據庫重新創建完成，開始數據遷移');
                    return 0; // 新數據庫沒有舊數據需要遷移
                }
                
                const request = store.openCursor();
                let migratedCount = 0;
                
                return new Promise((resolve, reject) => {
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const item = cursor.value;
                            
                            // 檢查是否需要遷移（沒有storyFolder字段）
                            if (!item.hasOwnProperty('storyFolder')) {
                                // 為現有數據添加storyFolder字段
                                item.storyFolder = item.storyTitle || '未分類';
                                
                                // 更新數據
                                cursor.update(item);
                                migratedCount++;
                                console.log('[VN歷史] 遷移數據:', item.id, '->', item.storyFolder);
                            }
                            
                            cursor.continue();
                        } else {
                            if (migratedCount > 0) {
                                console.log('[VN歷史] 數據遷移完成，共遷移', migratedCount, '條記錄');
                            } else {
                                console.log('[VN歷史] 無需遷移的數據');
                            }
                            resolve(migratedCount);
                        }
                    };
                    
                    request.onerror = () => {
                        console.error('[VN歷史] 數據遷移失敗:', request.error);
                        reject(request.error);
                    };
                });
            } catch (error) {
                console.error('[VN歷史] 數據遷移時發生錯誤:', error);
                throw error;
            }
        }

        // 強制重新創建數據庫（用於修復索引問題）
        async function forceRecreateVNHistoryDB() {
            try {
                console.log('[VN歷史] 開始強制重新創建數據庫...');
                
                // 刪除現有數據庫
                await new Promise((resolve, reject) => {
                    const deleteRequest = indexedDB.deleteDatabase(VN_HISTORY_DB_NAME);
                    deleteRequest.onsuccess = () => {
                        console.log('[VN歷史] 舊數據庫已刪除');
                        resolve();
                    };
                    deleteRequest.onerror = () => {
                        console.error('[VN歷史] 刪除舊數據庫失敗:', deleteRequest.error);
                        reject(deleteRequest.error);
                    };
                });
                
                // 重新創建數據庫
                const db = await initVNHistoryDB();
                console.log('[VN歷史] 新數據庫已創建，版本:', db.version);
                
                // 檢查索引
                const transaction = db.transaction([VN_HISTORY_STORE_NAME], 'readonly');
                const store = transaction.objectStore(VN_HISTORY_STORE_NAME);
                const indexes = Array.from(store.indexNames);
                console.log('[VN歷史] 可用索引:', indexes);
                
                db.close();
                return true;
            } catch (error) {
                console.error('[VN歷史] 強制重新創建數據庫失敗:', error);
                return false;
            }
        }

        // 計算token數量的函數
        function calculateTokenCount(text) {
            if (!text || typeof text !== 'string') return 0;
            // 簡單的token估算：中文字符算1個token，英文單詞算1個token
            const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
            const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
            const otherChars = text.length - chineseChars - englishWords;
            return chineseChars + englishWords + Math.ceil(otherChars / 4);
        }

        // 計算VN劇情的token使用量
        function calculateVNTokenUsage(storyData, aiResponse) {
            console.log('[Token計算] 開始計算token使用量，輸入數據:', {
                storyData: storyData,
                aiResponse: aiResponse ? aiResponse.substring(0, 100) + '...' : '無AI回應'
            });
            
            let totalTokens = 0;
            const tokenBreakdown = {
                prompt: 0,
                worldBooks: 0,
                characters: 0,
            cot: 0,
                aiResponse: 0,
                total: 0
            };

        // 計算COT token
        if (window.JCYCOTProcessor && window.JCYCOTProcessor.isEnabled()) {
            const cotContent = window.JCYCOTProcessor.getCOTContent();
            if (cotContent) {
                tokenBreakdown.cot = calculateTokenCount(cotContent);
                totalTokens += tokenBreakdown.cot;
                console.log('[Token計算] COT token:', tokenBreakdown.cot, 'COT長度:', cotContent.length);
            } else {
                console.log('[Token計算] COT已啟用但無內容');
            }
        } else {
            console.log('[Token計算] COT未啟用');
        }

            // 計算提示詞token
            if (storyData.content) {
                tokenBreakdown.prompt = calculateTokenCount(storyData.content);
                totalTokens += tokenBreakdown.prompt;
                console.log('[Token計算] 提示詞token:', tokenBreakdown.prompt, '內容長度:', storyData.content.length);
            } else {
                console.log('[Token計算] 無提示詞內容');
            }

            // 計算世界書token
            console.log('[Token計算] 世界書數據詳細檢查:', {
                storyDataWorldBooks: storyData.worldBooks,
                worldBooksType: typeof storyData.worldBooks,
                worldBooksIsArray: Array.isArray(storyData.worldBooks),
                worldBooksLength: storyData.worldBooks ? storyData.worldBooks.length : 0
            });
            
            if (storyData.worldBooks && Array.isArray(storyData.worldBooks)) {
                console.log('[Token計算] 世界書數量:', storyData.worldBooks.length);
                storyData.worldBooks.forEach((worldBook, index) => {
                    console.log(`[Token計算] 世界書${index + 1}詳細數據:`, {
                        id: worldBook.id,
                        name: worldBook.name,
                        content: worldBook.content,
                        contentLength: worldBook.content ? worldBook.content.length : 0,
                        hasContent: !!worldBook.content
                    });
                    
                    if (worldBook.content) {
                        const worldBookTokens = calculateTokenCount(worldBook.content);
                        tokenBreakdown.worldBooks += worldBookTokens;
                        totalTokens += worldBookTokens;
                        console.log(`[Token計算] 世界書${index + 1} "${worldBook.name}" token:`, worldBookTokens);
                    } else {
                        console.log(`[Token計算] 世界書${index + 1} "${worldBook.name}" 無內容`);
                    }
                });
            } else {
                console.log('[Token計算] 無世界書數據或格式錯誤:', storyData.worldBooks);
            }

            // 計算角色設定token
            if (storyData.characters) {
                console.log('[Token計算] 角色數據結構:', {
                    hasMain: !!storyData.characters.main,
                    mainHasPersonality: !!(storyData.characters.main && storyData.characters.main.personality),
                    supportingCount: storyData.characters.supporting ? storyData.characters.supporting.length : 0
                });
                
                // 詳細檢查主角數據
                if (storyData.characters.main) {
                    console.log('[Token計算] 主角詳細數據:', {
                        name: storyData.characters.main.name,
                        personality: storyData.characters.main.personality,
                        hasPersonality: !!storyData.characters.main.personality,
                        personalityLength: storyData.characters.main.personality ? storyData.characters.main.personality.length : 0,
                        allFields: Object.keys(storyData.characters.main)
                    });
                    
                    // 嘗試多個可能的角色描述字段
                    const mainCharContent = storyData.characters.main.personality || 
                                          storyData.characters.main.description || 
                                          storyData.characters.main.content || 
                                          storyData.characters.main.profile || '';
                    
                    if (mainCharContent) {
                        const mainCharTokens = calculateTokenCount(mainCharContent);
                        tokenBreakdown.characters += mainCharTokens;
                        totalTokens += mainCharTokens;
                        console.log('[Token計算] 主角token:', mainCharTokens, '角色名:', storyData.characters.main.name, '使用字段:', 
                            storyData.characters.main.personality ? 'personality' : 
                            storyData.characters.main.description ? 'description' : 
                            storyData.characters.main.content ? 'content' : 'profile');
                    } else {
                        console.log('[Token計算] 主角無任何描述字段');
                    }
                } else {
                    console.log('[Token計算] 主角不存在');
                }
                
                // 詳細檢查配角數據
                if (storyData.characters.supporting && Array.isArray(storyData.characters.supporting)) {
                    console.log('[Token計算] 配角數量:', storyData.characters.supporting.length);
                    storyData.characters.supporting.forEach((char, index) => {
                        console.log(`[Token計算] 配角${index + 1}詳細數據:`, {
                            name: char.name,
                            personality: char.personality,
                            hasPersonality: !!char.personality,
                            personalityLength: char.personality ? char.personality.length : 0,
                            allFields: Object.keys(char)
                        });
                        
                        // 嘗試多個可能的角色描述字段
                        const charContent = char.personality || 
                                           char.description || 
                                           char.content || 
                                           char.profile || '';
                        
                        if (charContent) {
                            const charTokens = calculateTokenCount(charContent);
                            tokenBreakdown.characters += charTokens;
                            totalTokens += charTokens;
                            console.log(`[Token計算] 配角${index + 1} "${char.name}" token:`, charTokens, '使用字段:', 
                                char.personality ? 'personality' : 
                                char.description ? 'description' : 
                                char.content ? 'content' : 'profile');
                        } else {
                            console.log(`[Token計算] 配角${index + 1} "${char.name}" 無任何描述字段`);
                        }
                    });
                } else {
                    console.log('[Token計算] 無配角數據或格式錯誤:', storyData.characters.supporting);
                }
            } else {
                console.log('[Token計算] 無角色數據');
            }

            // 計算AI回應token
            if (aiResponse) {
                tokenBreakdown.aiResponse = calculateTokenCount(aiResponse);
                totalTokens += tokenBreakdown.aiResponse;
                console.log('[Token計算] AI回應token:', tokenBreakdown.aiResponse, '回應長度:', aiResponse.length);
            } else {
                console.log('[Token計算] 無AI回應');
            }

            tokenBreakdown.total = totalTokens;
            console.log('[Token計算] 最終token統計:', tokenBreakdown);
            return tokenBreakdown;
        }

        // 保存劇情到 IndexedDB
        async function saveVNStoryToHistory(storyData, aiResponse, parsedData) {
            try {
                const db = await initVNHistoryDB();
                const transaction = db.transaction([VN_HISTORY_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(VN_HISTORY_STORE_NAME);
                
                // 計算token使用量
                const tokenUsage = calculateVNTokenUsage(storyData, aiResponse);
                
                const historyEntry = {
                    timestamp: Date.now(),
                    storyTitle: storyData.title || '未命名劇情',
                    storyFolder: storyData.title || '未分類', // 使用劇情標題作為資料夾名稱
                    storyId: parsedData.dialogues.find(d => d.type === 'story')?.storyId || 'UNKNOWN',
                    storyDescription: storyData.description || '',
                    characters: storyData.characters || {},
                    aiResponse: aiResponse,
                    parsedData: parsedData,
                    dialogueCount: parsedData.dialogues.length,
                    choiceCount: parsedData.choices.length,
                    tokenUsage: tokenUsage,
                    // 保存發送給AI的完整內容
                    sentToAI: {
                        prompt: storyData.content || '',
                        worldBooks: storyData.worldBooks || [],
                        characters: storyData.characters || {},
                        opening: storyData.opening || '',
                        // 保存AI實際接收到的完整提示詞
                        fullPrompt: storyData.fullPrompt || ''
                    }
                };
                
                const request = store.add(historyEntry);
                
                return new Promise((resolve, reject) => {
                    request.onsuccess = () => {
                        console.log('[VN歷史] 劇情已保存到歷史記錄，ID:', request.result);
                        resolve(request.result);
                    };
                    
                    request.onerror = () => {
                        console.error('[VN歷史] 保存劇情失敗:', request.error);
                        reject(request.error);
                    };
                });
            } catch (error) {
                console.error('[VN歷史] 保存劇情時發生錯誤:', error);
                throw error;
            }
        }

        // 獲取所有歷史劇情
        async function getAllVNHistory() {
            try {
                const db = await initVNHistoryDB();
                const transaction = db.transaction([VN_HISTORY_STORE_NAME], 'readonly');
                const store = transaction.objectStore(VN_HISTORY_STORE_NAME);
                const index = store.index('timestamp');
                
                const request = index.openCursor(null, 'prev'); // 按時間倒序
                const history = [];
                
                return new Promise((resolve, reject) => {
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            history.push(cursor.value);
                            cursor.continue();
                        } else {
                            console.log('[VN歷史] 獲取到', history.length, '條歷史記錄');
                            resolve(history);
                        }
                    };
                    
                    request.onerror = () => {
                        console.error('[VN歷史] 獲取歷史記錄失敗:', request.error);
                        reject(request.error);
                    };
                });
            } catch (error) {
                console.error('[VN歷史] 獲取歷史記錄時發生錯誤:', error);
                throw error;
            }
        }

        // 獲取所有資料夾分類
        async function getAllVNHistoryFolders() {
            try {
                const db = await initVNHistoryDB();
                const transaction = db.transaction([VN_HISTORY_STORE_NAME], 'readonly');
                const store = transaction.objectStore(VN_HISTORY_STORE_NAME);
                
                // 檢查storyFolder索引是否存在
                if (!store.indexNames.contains('storyFolder')) {
                    console.warn('[VN歷史] storyFolder索引不存在，嘗試重新創建數據庫');
                    // 如果索引不存在，返回空列表，讓數據遷移處理
                    return [];
                }
                
                const index = store.index('storyFolder');
                const request = index.openCursor();
                const folders = new Set();
                
                return new Promise((resolve, reject) => {
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const folder = cursor.value.storyFolder || '未分類';
                            folders.add(folder);
                            cursor.continue();
                        } else {
                            const folderList = Array.from(folders).sort();
                            console.log('[VN歷史] 獲取到', folderList.length, '個資料夾分類');
                            resolve(folderList);
                        }
                    };
                    
                    request.onerror = () => {
                        console.error('[VN歷史] 獲取資料夾分類失敗:', request.error);
                        reject(request.error);
                    };
                });
            } catch (error) {
                console.error('[VN歷史] 獲取資料夾分類時發生錯誤:', error);
                // 如果出現錯誤，返回空列表而不是拋出錯誤
                return [];
            }
        }

        // 根據資料夾獲取歷史劇情
        async function getVNHistoryByFolder(folderName) {
            try {
                const db = await initVNHistoryDB();
                const transaction = db.transaction([VN_HISTORY_STORE_NAME], 'readonly');
                const store = transaction.objectStore(VN_HISTORY_STORE_NAME);
                const index = store.index('storyFolder');
                
                const request = index.getAll(folderName);
                
                return new Promise((resolve, reject) => {
                    request.onsuccess = () => {
                        const stories = request.result || [];
                        console.log('[VN歷史] 獲取資料夾', folderName, '的劇情:', stories.length, '個');
                        resolve(stories);
                    };
                    
                    request.onerror = () => {
                        console.error('[VN歷史] 獲取資料夾劇情失敗:', request.error);
                        reject(request.error);
                    };
                });
            } catch (error) {
                console.error('[VN歷史] 獲取資料夾劇情時發生錯誤:', error);
                throw error;
            }
        }

        // 根據 ID 獲取特定劇情
        async function getVNStoryById(id) {
            try {
                const db = await initVNHistoryDB();
                const transaction = db.transaction([VN_HISTORY_STORE_NAME], 'readonly');
                const store = transaction.objectStore(VN_HISTORY_STORE_NAME);
                
                const request = store.get(parseInt(id));
                
                return new Promise((resolve, reject) => {
                    request.onsuccess = () => {
                        if (request.result) {
                            console.log('[VN歷史] 獲取劇情成功:', request.result.storyTitle);
                            resolve(request.result);
                        } else {
                            console.error('[VN歷史] 未找到指定ID的劇情:', id);
                            reject(new Error('劇情不存在'));
                        }
                    };
                    
                    request.onerror = () => {
                        console.error('[VN歷史] 獲取劇情失敗:', request.error);
                        reject(request.error);
                    };
                });
            } catch (error) {
                console.error('[VN歷史] 獲取劇情時發生錯誤:', error);
                throw error;
            }
        }

        // 刪除歷史劇情
        async function deleteVNStoryFromHistory(id) {
            try {
                const db = await initVNHistoryDB();
                const transaction = db.transaction([VN_HISTORY_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(VN_HISTORY_STORE_NAME);
                
                const request = store.delete(parseInt(id));
                
                return new Promise((resolve, reject) => {
                    request.onsuccess = () => {
                        console.log('[VN歷史] 劇情已刪除，ID:', id);
                        resolve();
                    };
                    
                    request.onerror = () => {
                        console.error('[VN歷史] 刪除劇情失敗:', request.error);
                        reject(request.error);
                    };
                });
            } catch (error) {
                console.error('[VN歷史] 刪除劇情時發生錯誤:', error);
                throw error;
            }
        }

        // 創建歷史劇情查看界面
        function createVNHistoryViewer() {
            // 添加樣式
            if (!document.getElementById('vn-history-styles')) {
                const historyStyles = document.createElement('style');
                historyStyles.id = 'vn-history-styles';
                historyStyles.textContent = `
                    .vn-history-modal {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.8);
                        z-index: 99999;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        backdrop-filter: blur(5px);
                    }
                    
                    .vn-history-content {
                        background: #1a1a2e;
                        border-radius: 15px;
                        width: 90vw;
                        max-width: 1000px;
                        max-height: 80vh;
                        overflow: hidden;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                    }
                    
                    .vn-history-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 20px;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                        background: rgba(255, 255, 255, 0.05);
                    }
                    
                    .vn-history-header h2 {
                        color: white;
                        margin: 0;
                        font-size: 18px;
                    }
                    
                    .vn-history-controls {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }
                    
                    .vn-history-folder-select {
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 6px;
                        color: white;
                        padding: 8px 12px;
                        font-size: 14px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        min-width: 150px;
                    }
                    
                    .vn-history-folder-select:focus {
                        outline: none;
                        border-color: #4CAF50;
                        background: rgba(255, 255, 255, 0.15);
                    }
                    
                    .vn-history-folder-select option {
                        background: #1a1a2e;
                        color: white;
                        padding: 8px;
                    }
                    
                    .vn-history-close {
                        background: none;
                        border: none;
                        color: #4CAF50;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 5px 10px;
                        border-radius: 5px;
                        transition: all 0.3s ease;
                    }
                    
                    .vn-history-close:hover {
                        background: rgba(76, 175, 80, 0.2);
                    }
                    
                    .vn-history-body {
                        padding: 20px;
                        max-height: 60vh;
                        overflow-y: auto;
                    }
                    
                    .vn-history-item {
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 10px;
                        padding: 15px;
                        margin-bottom: 15px;
                        transition: all 0.3s ease;
                        cursor: pointer;
                    }
                    
                    .vn-history-item:hover {
                        background: rgba(255, 255, 255, 0.1);
                        border-color: rgba(76, 175, 80, 0.3);
                    }
                    
                    .vn-history-item-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 10px;
                    }
                    
                    .vn-history-item-title {
                        color: white;
                        font-size: 16px;
                        font-weight: bold;
                        margin: 0 0 5px 0;
                    }
                    
                    .vn-history-item-meta {
                        color: rgba(255, 255, 255, 0.7);
                        font-size: 12px;
                        margin: 0;
                    }
                    
                    .vn-history-item-tokens {
                        color: #4CAF50;
                        font-size: 11px;
                        margin: 5px 0;
                        font-weight: 500;
                        background: rgba(76, 175, 80, 0.1);
                        padding: 4px 8px;
                        border-radius: 4px;
                        border: 1px solid rgba(76, 175, 80, 0.2);
                    }
                    
                    .vn-history-item-actions {
                        display: flex;
                        gap: 8px;
                    }
                    
                    .vn-history-btn {
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        color: white;
                        padding: 5px 10px;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 12px;
                        transition: all 0.3s ease;
                    }
                    
                    .vn-history-btn:hover {
                        background: rgba(76, 175, 80, 0.3);
                        border-color: #4CAF50;
                    }
                    
                    .vn-history-btn.delete:hover {
                        background: rgba(244, 67, 54, 0.3);
                        border-color: #f44336;
                    }
                    
                    .vn-history-btn.details {
                        background: rgba(33, 150, 243, 0.2);
                        border-color: rgba(33, 150, 243, 0.3);
                        color: #2196F3;
                    }
                    
                    .vn-history-btn.details:hover {
                        background: rgba(33, 150, 243, 0.3);
                        border-color: #2196F3;
                    }
                    
                    .vn-history-empty {
                        text-align: center;
                        color: rgba(255, 255, 255, 0.5);
                        padding: 40px;
                        font-size: 16px;
                    }
                    
                    .vn-history-loading {
                        text-align: center;
                        color: rgba(255, 255, 255, 0.7);
                        padding: 40px;
                        font-size: 16px;
                    }
                    
                    /* 劇情詳情模態窗口樣式 */
                    .vn-story-details-modal .custom-alert-content {
                        max-height: 80vh;
                        overflow-y: auto;
                    }
                    
                    .vn-story-details h3 {
                        color: #4CAF50;
                        margin: 20px 0 10px 0;
                        font-size: 16px;
                        border-bottom: 1px solid rgba(76, 175, 80, 0.3);
                        padding-bottom: 5px;
                    }
                    
                    .vn-story-details h4 {
                        color: #2196F3;
                        margin: 15px 0 8px 0;
                        font-size: 14px;
                    }
                    
                    .token-breakdown {
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        padding: 15px;
                        margin: 10px 0;
                    }
                    
                    .token-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 5px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    
                    .token-item:last-child {
                        border-bottom: none;
                        font-weight: bold;
                        color: #4CAF50;
                    }
                    
                    .token-label {
                        color: rgba(0, 0, 0, 0.8);
                        font-size: 13px;
                    }
                    
                    .token-value {
                        color: #4CAF50;
                        font-weight: 500;
                        font-size: 13px;
                    }
                    
                    .ai-content-section {
                        margin-top: 20px;
                    }
                    
                    .content-box {
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 6px;
                        padding: 12px;
                        margin: 8px 0;
                        color: rgba(0, 0, 0, 0.9);
                        font-size: 13px;
                        line-height: 1.5;
                        max-height: 200px;
                        overflow-y: auto;
                        white-space: pre-wrap;
                    }
                    
                    /* 完整發送內容的特殊樣式 */
                    .full-content-box {
                        background: rgba(0, 0, 0, 0.4) !important;
                        border: 1px solid rgba(255, 255, 255, 0.2) !important;
                        color: #ffffff !important;
                        font-family: 'Courier New', monospace !important;
                        font-size: 13px !important;
                        line-height: 1.6 !important;
                        white-space: pre-wrap !important;
                        word-wrap: break-word !important;
                        padding: 20px !important;
                        border-radius: 8px !important;
                        max-height: 60vh !important;
                        overflow-y: auto !important;
                    }
                    
                    .worldbook-item, .character-item {
                        margin: 10px 0;
                        padding: 8px;
                        background: rgba(255, 255, 255, 0.03);
                        border-radius: 4px;
                        border-left: 3px solid #4CAF50;
                    }
                    
                    .worldbook-item strong, .character-item strong {
                        color: #4CAF50;
                        font-size: 14px;
                    }
                    
                    /* 完整發送內容按鈕樣式 */
                    .full-content-btn {
                        background: rgba(76, 175, 80, 0.2) !important;
                        border-color: #4CAF50 !important;
                        color: #4CAF50 !important;
                        padding: 10px 20px !important;
                        font-size: 14px !important;
                        transition: all 0.3s ease !important;
                    }
                    
                    .full-content-btn:hover {
                        background: rgba(76, 175, 80, 0.3) !important;
                        transform: translateY(-1px) !important;
                        box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3) !important;
                    }
                    
                    /* 複製按鈕樣式 */
                    .copy-btn {
                        background: rgba(33, 150, 243, 0.2) !important;
                        border-color: #2196F3 !important;
                        color: #2196F3 !important;
                        transition: all 0.3s ease !important;
                    }
                    
                    .copy-btn:hover {
                        background: rgba(33, 150, 243, 0.3) !important;
                        transform: translateY(-1px) !important;
                        box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3) !important;
                    }
                    
                    /* 折疊功能樣式 */
                    .collapsible-header {
                        cursor: pointer !important;
                        user-select: none !important;
                        padding: 8px 12px !important;
                        background: rgba(255, 255, 255, 0.05) !important;
                        border-radius: 6px !important;
                        margin: 10px 0 5px 0 !important;
                        border: 1px solid rgba(255, 255, 255, 0.1) !important;
                        transition: all 0.3s ease !important;
                        display: flex !important;
                        justify-content: space-between !important;
                        align-items: center !important;
                    }
                    
                    .collapsible-header:hover {
                        background: rgba(255, 255, 255, 0.1) !important;
                        border-color: rgba(255, 255, 255, 0.2) !important;
                    }
                    
                    .collapsible-header:active {
                        background: rgba(255, 255, 255, 0.15) !important;
                    }
                    
                    .toggle-icon {
                        font-size: 12px !important;
                        transition: transform 0.3s ease !important;
                        color: rgba(255, 255, 255, 0.7) !important;
                    }
                    
                    .collapsible-content {
                        display: block !important;
                        transition: all 0.3s ease !important;
                    }
                `;
                document.head.appendChild(historyStyles);
            }
            
            const modal = document.createElement('div');
            modal.id = 'vn-history-modal';
            modal.className = 'vn-history-modal';
            modal.style.display = 'flex';
            
            modal.innerHTML = `
                <div class="vn-history-content">
                    <div class="vn-history-header">
                        <h2>歷史劇情記錄</h2>
                        <div class="vn-history-controls">
                            <select id="vnHistoryFolderSelect" class="vn-history-folder-select" onchange="handleVNHistoryFolderChange()">
                                <option value="">所有劇情</option>
                            </select>
                            <button class="vn-history-close" onclick="closeVNHistoryViewer()">×</button>
                        </div>
                    </div>
                    <div class="vn-history-body" id="vnHistoryBody">
                        <div class="vn-history-loading">載入中...</div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            console.log('[VN歷史] 模態窗口已添加到DOM');
            
            // 異步載入數據
            (async () => {
                try {
                    await migrateVNHistoryData(); // 先執行數據遷移
                    loadVNHistoryFolders(); // 載入資料夾列表
                    loadVNHistory(); // 載入歷史記錄
                    console.log('[VN歷史] 歷史劇情查看器已創建並顯示');
                } catch (error) {
                    console.error('[VN歷史] 初始化歷史劇情查看器失敗:', error);
                }
            })();
        }

        // 關閉歷史劇情查看器
        window.closeVNHistoryViewer = function() {
            const modal = document.getElementById('vn-history-modal');
            if (modal) {
                modal.style.display = 'none';
                console.log('[VN歷史] 歷史劇情查看器已關閉');
            }
        }

        // 載入歷史劇情列表
        async function loadVNHistory(folderName = '') {
            const historyBody = document.getElementById('vnHistoryBody');
            if (!historyBody) {
                console.error('[VN歷史] 找不到歷史記錄容器');
                return;
            }
            
            try {
                historyBody.innerHTML = '<div class="vn-history-loading">載入中...</div>';
                console.log('[VN歷史] 開始載入歷史記錄...', folderName ? `資料夾: ${folderName}` : '所有劇情');
                
                // 根據資料夾篩選歷史記錄
                let history;
                if (folderName) {
                    history = await getVNHistoryByFolder(folderName);
                } else {
                    history = await getAllVNHistory();
                }
                console.log('[VN歷史] 獲取到歷史記錄:', history);
                
                if (history.length === 0) {
                    const emptyMessage = folderName ? 
                        `暫無「${folderName}」資料夾的歷史劇情記錄` : 
                        '暫無歷史劇情記錄';
                    historyBody.innerHTML = `<div class="vn-history-empty">${emptyMessage}<br><br>💡 提示：開始新的VN劇情後，會自動保存到這裡</div>`;
                    console.log('[VN歷史] 沒有歷史記錄');
                    return;
                }
                
                historyBody.innerHTML = '';
                
                history.forEach(item => {
                    const historyItem = createVNHistoryItem(item);
                    historyBody.appendChild(historyItem);
                });
                
                console.log('[VN歷史] 已載入', history.length, '條歷史記錄');
            } catch (error) {
                console.error('[VN歷史] 載入歷史記錄失敗:', error);
                historyBody.innerHTML = '<div class="vn-history-empty">載入失敗: ' + error.message + '<br><br>💡 這可能是因為瀏覽器不支持 IndexedDB 或權限不足</div>';
            }
        }

        // 載入資料夾列表
        async function loadVNHistoryFolders() {
            try {
                const folderSelect = document.getElementById('vnHistoryFolderSelect');
                if (!folderSelect) {
                    console.error('[VN歷史] 找不到資料夾選擇器');
                    return;
                }
                
                const folders = await getAllVNHistoryFolders();
                console.log('[VN歷史] 獲取到資料夾列表:', folders);
                
                // 清空現有選項（保留"所有劇情"選項）
                folderSelect.innerHTML = '<option value="">所有劇情</option>';
                
                // 添加資料夾選項
                folders.forEach(folder => {
                    const option = document.createElement('option');
                    option.value = folder;
                    option.textContent = folder;
                    folderSelect.appendChild(option);
                });
                
                console.log('[VN歷史] 已載入', folders.length, '個資料夾選項');
                
                // 如果沒有資料夾，顯示提示
                if (folders.length === 0) {
                    console.log('[VN歷史] 暫無資料夾分類，所有劇情將歸類到"未分類"');
                }
            } catch (error) {
                console.error('[VN歷史] 載入資料夾列表失敗:', error);
                // 即使失敗也顯示"所有劇情"選項
                if (folderSelect) {
                    folderSelect.innerHTML = '<option value="">所有劇情</option>';
                }
            }
        }

        // 處理資料夾選擇變化
        window.handleVNHistoryFolderChange = function() {
            const folderSelect = document.getElementById('vnHistoryFolderSelect');
            if (folderSelect) {
                const selectedFolder = folderSelect.value;
                console.log('[VN歷史] 選擇資料夾:', selectedFolder);
                loadVNHistory(selectedFolder);
            }
        }

        // 創建歷史劇情項目
        function createVNHistoryItem(item) {
            const itemElement = document.createElement('div');
            itemElement.className = 'vn-history-item';
            
            const date = new Date(item.timestamp);
            const dateStr = date.toLocaleString('zh-TW');
            
            // 計算token使用量
        const tokenUsage = item.tokenUsage || { total: 0, prompt: 0, worldBooks: 0, characters: 0, cot: 0, aiResponse: 0 };
        const tokenStr = `Token: ${tokenUsage.total} (提示詞:${tokenUsage.prompt} + 世界書:${tokenUsage.worldBooks} + 角色:${tokenUsage.characters}${tokenUsage.cot > 0 ? ' + COT:' + tokenUsage.cot : ''} + AI回應:${tokenUsage.aiResponse})`;
            
            itemElement.innerHTML = `
                <div class="vn-history-item-header">
                    <div>
                        <div class="vn-history-item-title">${item.storyTitle}</div>
                        <div class="vn-history-item-meta">
                            📁 ${item.storyFolder || '未分類'} | ID: ${item.storyId} | 對話: ${item.dialogueCount} | 選項: ${item.choiceCount} | ${dateStr}
                        </div>
                        <div class="vn-history-item-tokens">${tokenStr}</div>
                        ${item.storyDescription ? `<div class="vn-history-item-meta">${item.storyDescription}</div>` : ''}
                    </div>
                    <div class="vn-history-item-actions">
                        <button class="vn-history-btn" onclick="loadVNStoryFromHistory(${item.id})">重新播放</button>
                        <button class="vn-history-btn details" onclick="showVNStoryDetails(${item.id})" title="查看發送給AI的內容">查看詳情</button>
                        <button class="vn-history-btn delete" onclick="deleteVNStoryFromHistoryUI(${item.id})">刪除</button>
                    </div>
                </div>
            `;
            
            return itemElement;
        }

        // 從歷史記錄載入劇情
        window.loadVNStoryFromHistory = async function(id) {
            try {
                const storyData = await getVNStoryById(id);
                
                // 發送到VN面板
                const vnIframe = document.getElementById('vn-iframe');
                if (vnIframe && vnIframe.contentWindow) {
                    vnIframe.contentWindow.postMessage({
                        type: 'VN_DATA',
                        data: storyData.parsedData,
                        messageId: 'history_load_' + Date.now()
                    }, '*');
                    console.log('[VN歷史] 已載入歷史劇情到VN面板:', storyData.storyTitle);
                    
                    // 關閉歷史查看器
                    closeVNHistoryViewer();
                    
                    // 顯示成功提示
                    showCustomAlert('載入成功', `已載入歷史劇情：${storyData.storyTitle}`);
                } else {
                    console.error('[VN歷史] VN面板iframe未找到，無法載入劇情');
                    showCustomAlert('載入失敗', 'VN面板未找到，請確保VN面板已打開');
                }
            } catch (error) {
                console.error('[VN歷史] 載入歷史劇情失敗:', error);
                showCustomAlert('載入失敗', `無法載入歷史劇情：${error.message}`);
            }
        }

        // 刪除歷史劇情（UI函數）
        window.deleteVNStoryFromHistoryUI = async function(id) {
            if (!confirm('確定要刪除這條歷史記錄嗎？此操作無法撤銷。')) {
                return;
            }
            
            try {
                await deleteVNStoryFromHistory(id);
                
                // 重新載入資料夾列表和當前資料夾的內容
                await loadVNHistoryFolders();
                const folderSelect = document.getElementById('vnHistoryFolderSelect');
                const currentFolder = folderSelect ? folderSelect.value : '';
                await loadVNHistory(currentFolder);
                
                console.log('[VN歷史] 歷史劇情已刪除');
            } catch (error) {
                console.error('[VN歷史] 刪除歷史劇情失敗:', error);
                showCustomAlert('刪除失敗', `無法刪除歷史劇情：${error.message}`);
            }
        }

        // 顯示歷史劇情查看器
        window.showVNHistoryViewer = async function() {
            console.log('[VN歷史] 開始顯示歷史劇情查看器');
            
            try {
                // 先執行數據遷移
                await migrateVNHistoryData();
                
                const modal = document.getElementById('vn-history-modal');
                if (modal) {
                    modal.style.display = 'flex';
                    modal.style.zIndex = '9999';
                    loadVNHistoryFolders(); // 先載入資料夾列表
                    loadVNHistory(); // 載入歷史記錄
                    console.log('[VN歷史] 歷史劇情查看器已顯示');
                } else {
                    console.log('[VN歷史] 模態窗口不存在，正在創建...');
                    createVNHistoryViewer();
                }
            } catch (error) {
                console.error('[VN歷史] 顯示歷史劇情查看器失敗:', error);
                alert('載入歷史劇情失敗，請重試');
            }
        }

        // 顯示劇情詳情
        window.showVNStoryDetails = async function(id) {
            try {
                console.log('[VN詳情] 開始獲取劇情詳情，ID:', id);
                const storyData = await getVNStoryById(id);
                console.log('[VN詳情] 獲取到的劇情數據:', storyData);
                
            const tokenUsage = storyData.tokenUsage || { total: 0, prompt: 0, worldBooks: 0, characters: 0, cot: 0, aiResponse: 0 };
                const sentToAI = storyData.sentToAI || {};
                
                console.log('[VN詳情] Token使用量:', tokenUsage);
                console.log('[VN詳情] 發送給AI的內容:', sentToAI);
                
                // 創建詳情內容
                let detailsContent = `
                    <div class="vn-story-details">
                        <h3>📊 Token使用量統計</h3>
                        <div class="token-breakdown">
                            <div class="token-item">
                                <span class="token-label">總計:</span>
                                <span class="token-value">${tokenUsage.total} tokens</span>
                            </div>
                            <div class="token-item">
                                <span class="token-label">提示詞:</span>
                                <span class="token-value">${tokenUsage.prompt} tokens</span>
                            </div>
                            <div class="token-item">
                                <span class="token-label">世界書:</span>
                                <span class="token-value">${tokenUsage.worldBooks} tokens</span>
                            </div>
                            <div class="token-item">
                                <span class="token-label">角色設定:</span>
                                <span class="token-value">${tokenUsage.characters} tokens</span>
                            </div>
                        ${tokenUsage.cot > 0 ? `
                        <div class="token-item">
                            <span class="token-label">COT思維鏈:</span>
                            <span class="token-value">${tokenUsage.cot} tokens</span>
                        </div>
                        ` : ''}
                            <div class="token-item">
                                <span class="token-label">AI回應:</span>
                                <span class="token-value">${tokenUsage.aiResponse} tokens</span>
                            </div>
                        </div>
                        
                        <h3>📝 發送給AI的內容</h3>
                        <div class="ai-content-section">
                            <h4>🎯 劇情提示詞</h4>
                            <div class="content-box">${sentToAI.prompt || '無內容'}</div>
                            
                            ${sentToAI.opening ? `
                            <h4>🎬 開場白</h4>
                            <div class="content-box">${sentToAI.opening}</div>
                            ` : ''}
                            
                            ${sentToAI.worldBooks && sentToAI.worldBooks.length > 0 ? `
                            <h4 class="collapsible-header" onclick="toggleSection('worldbooks-${id}')">
                                📚 世界書設定 <span class="toggle-icon">▶</span>
                            </h4>
                            <div class="content-box collapsible-content" id="worldbooks-${id}" style="display: none;">
                                ${sentToAI.worldBooks.map(wb => `
                                    <div class="worldbook-item">
                                        <strong>${wb.name}</strong><br>
                                        ${wb.content || '無內容'}
                                    </div>
                                `).join('<hr>')}
                            </div>
                            ` : ''}
                            
                            ${sentToAI.characters && (sentToAI.characters.main || (sentToAI.characters.supporting && sentToAI.characters.supporting.length > 0)) ? `
                            <h4 class="collapsible-header" onclick="toggleSection('characters-${id}')">
                                👥 角色設定 <span class="toggle-icon">▶</span>
                            </h4>
                            <div class="content-box collapsible-content" id="characters-${id}" style="display: none;">
                                ${sentToAI.characters.main ? `
                                    <div class="character-item">
                                        <strong>主角: ${sentToAI.characters.main.name}</strong><br>
                                        ${sentToAI.characters.main.personality || sentToAI.characters.main.description || sentToAI.characters.main.content || sentToAI.characters.main.profile || '無設定'}
                                    </div>
                                ` : ''}
                                ${sentToAI.characters.supporting && sentToAI.characters.supporting.length > 0 ? 
                                    sentToAI.characters.supporting.map(char => `
                                        <div class="character-item">
                                            <strong>配角: ${char.name}</strong><br>
                                            ${char.personality || char.description || char.content || char.profile || '無設定'}
                                        </div>
                                    `).join('') : ''
                                }
                            </div>
                            ` : ''}
                        </div>
                        
                        <h4 class="collapsible-header" onclick="toggleFullContentSection(${id})">
                            📋 完整發送內容排列 <span class="toggle-icon">▶</span>
                        </h4>
                        <div class="content-box collapsible-content" id="fullContentSection-${id}" style="display: none;">
                            <div class="full-content-text" id="fullContentText-${id}">
                                載入中...
                            </div>
                        </div>
                    </div>
                `;
                
                // 顯示詳情模態窗口
                showCustomAlert('劇情詳情', detailsContent, {
                    width: '800px',
                    height: '600px',
                    customClass: 'vn-story-details-modal',
                    zIndex: '999999'
                });
                
                // 確保折疊樣式被正確應用
                setTimeout(() => {
                    const modal = document.querySelector('.vn-story-details-modal');
                    if (modal) {
                        const style = document.createElement('style');
                        style.textContent = `
                            .vn-story-details-modal .collapsible-header {
                                cursor: pointer !important;
                                user-select: none !important;
                                padding: 8px 12px !important;
                                background: rgba(255, 255, 255, 0.05) !important;
                                border-radius: 6px !important;
                                margin: 10px 0 5px 0 !important;
                                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                                transition: all 0.3s ease !important;
                                display: flex !important;
                                justify-content: center !important;
                                align-items: center !important;
                                position: relative !important;
                            }
                            
                            .vn-story-details-modal .collapsible-header:hover {
                                background: rgba(255, 255, 255, 0.1) !important;
                                border-color: rgba(255, 255, 255, 0.2) !important;
                            }
                            
                            .vn-story-details-modal .collapsible-header:active {
                                background: rgba(255, 255, 255, 0.15) !important;
                            }
                            
                            .vn-story-details-modal .toggle-icon {
                                font-size: 12px !important;
                                transition: transform 0.3s ease !important;
                                color: rgba(255, 255, 255, 0.7) !important;
                                position: absolute !important;
                                right: 12px !important;
                                top: 50% !important;
                                transform: translateY(-50%) !important;
                            }
                            
                            .vn-story-details-modal .collapsible-content {
                                display: block !important;
                                transition: all 0.3s ease !important;
                            }
                            
                            .vn-story-details-modal .collapsible-content[style*="display: none"] {
                                display: none !important;
                            }
                        `;
                        modal.appendChild(style);
                    }
                }, 100);
                
            } catch (error) {
                console.error('[VN歷史] 顯示劇情詳情失敗:', error);
                showCustomAlert('錯誤', `無法顯示劇情詳情：${error.message}`);
            }
        }

        // 切換完整發送內容顯示
        window.toggleFullContentSection = async function(id) {
            try {
                const contentSection = document.getElementById(`fullContentSection-${id}`);
                const contentText = document.getElementById(`fullContentText-${id}`);
                const header = event.target.closest('.collapsible-header');
                const icon = header.querySelector('.toggle-icon');
                
                if (contentSection.style.display === 'none' || contentSection.style.display === '') {
                    // 顯示內容
                    console.log('[VN詳情] 開始獲取完整發送內容，ID:', id);
                    const storyData = await getVNStoryById(id);
                    const sentToAI = storyData.sentToAI || {};
                    
                    // 顯示AI實際接收到的完整提示詞
                    let fullContent = '';
                    
                    console.log('[VN詳情] 檢查完整提示詞:', {
                        hasFullPrompt: !!sentToAI.fullPrompt,
                        fullPromptLength: sentToAI.fullPrompt ? sentToAI.fullPrompt.length : 0,
                        sentToAIKeys: Object.keys(sentToAI)
                    });
                    
                    if (sentToAI.fullPrompt) {
                        // 如果有保存的完整提示詞，直接顯示
                        fullContent = sentToAI.fullPrompt;
                        console.log('[VN詳情] 使用保存的完整提示詞');
                    } else {
                        console.log('[VN詳情] 使用向後兼容的重新組織內容');
                        // 如果沒有保存的完整提示詞，顯示原始數據（向後兼容）
                        if (sentToAI.prompt) {
                            fullContent += `=== 劇情提示詞 ===\n\n${sentToAI.prompt}\n\n`;
                        }
                        
                        if (sentToAI.opening) {
                            fullContent += `=== 開場白 ===\n\n${sentToAI.opening}\n\n`;
                        }
                        
                        if (sentToAI.worldBooks && sentToAI.worldBooks.length > 0) {
                            fullContent += `=== 世界書設定 ===\n\n`;
                            sentToAI.worldBooks.forEach((wb, index) => {
                                fullContent += `【${wb.priority}】\n${wb.content || '無內容'}\n`;
                                if (index < sentToAI.worldBooks.length - 1) {
                                    fullContent += `\n`;
                                }
                            });
                            fullContent += `\n`;
                        }
                        
                        if (sentToAI.characters) {
                            if (sentToAI.characters.main) {
                                fullContent += `=== 主角設定 ===\n\n`;
                                fullContent += `【${sentToAI.characters.main.name}】\n`;
                                fullContent += `${sentToAI.characters.main.personality || sentToAI.characters.main.description || sentToAI.characters.main.content || sentToAI.characters.main.profile || '無設定'}\n\n`;
                            }
                            
                            if (sentToAI.characters.supporting && sentToAI.characters.supporting.length > 0) {
                                fullContent += `=== 配角設定 ===\n\n`;
                                sentToAI.characters.supporting.forEach((char, index) => {
                                    fullContent += `【${char.name}】\n`;
                                    fullContent += `${char.personality || char.description || char.content || char.profile || '無設定'}\n`;
                                    if (index < sentToAI.characters.supporting.length - 1) {
                                        fullContent += `\n`;
                                    }
                                });
                                fullContent += `\n`;
                            }
                        }
                        
                        if (sentToAI.cot) {
                            fullContent += `=== COT思維鏈 ===\n\n${sentToAI.cot}\n\n`;
                        }
                        
                        if (sentToAI.additionalContent) {
                            fullContent += `=== 其他內容 ===\n\n${sentToAI.additionalContent}\n\n`;
                        }
                    }
                    
                    // 如果沒有內容，顯示提示
                    if (!fullContent.trim()) {
                        fullContent = '暫無發送內容記錄';
                    }
                    
                    contentText.textContent = fullContent;
                    contentSection.style.setProperty('display', 'block', 'important');
                    icon.textContent = '▼';
                    icon.style.transform = 'rotate(0deg)';
                } else {
                    // 隱藏內容
                    contentSection.style.setProperty('display', 'none', 'important');
                    icon.textContent = '▶';
                    icon.style.transform = 'rotate(-90deg)';
                }
                
            } catch (error) {
                console.error('[VN詳情] 切換完整發送內容失敗:', error);
                showCustomAlert('錯誤', `無法顯示完整發送內容：${error.message}`);
            }
        }

        // 切換折疊區域
        window.toggleSection = function(sectionId) {
            const content = document.getElementById(sectionId);
            if (!content) {
                console.error('[VN詳情] 找不到元素:', sectionId);
                return;
            }
            
            const header = content.previousElementSibling;
            if (!header) {
                console.error('[VN詳情] 找不到標題元素');
                return;
            }
            
            const icon = header.querySelector('.toggle-icon');
            if (!icon) {
                console.error('[VN詳情] 找不到圖標元素');
                return;
            }
            
            console.log('[VN詳情] 切換折疊區域:', sectionId, '當前顯示狀態:', content.style.display);
            
            if (content.style.display === 'none' || content.style.display === '') {
                content.style.setProperty('display', 'block', 'important');
                icon.textContent = '▼';
                icon.style.transform = 'rotate(0deg)';
                console.log('[VN詳情] 展開區域');
            } else {
                content.style.setProperty('display', 'none', 'important');
                icon.textContent = '▶';
                icon.style.transform = 'rotate(-90deg)';
                console.log('[VN詳情] 收合區域');
            }
        }

        // 複製到剪貼板功能
        window.copyToClipboard = function(text) {
            try {
                navigator.clipboard.writeText(text).then(() => {
                    showCustomAlert('成功', '內容已複製到剪貼板！');
                }).catch(() => {
                    // 如果剪貼板API不可用，使用傳統方法
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    showCustomAlert('成功', '內容已複製到剪貼板！');
                });
            } catch (error) {
                console.error('[VN詳情] 複製到剪貼板失敗:', error);
                showCustomAlert('錯誤', '複製失敗，請手動複製內容');
            }
        }

        // 將函數掛載到全局
        window.showVNHistoryViewer = showVNHistoryViewer;

    // ===================================================================
    // COT管理功能
    // ===================================================================
    
    // 初始化COT管理界面
    function initCOTManagement() {
        console.log('[JCY-COT] 初始化COT管理界面');
        
        // 綁定COT管理界面事件
        const toggleCotBtn = document.getElementById('toggle-cot-btn');
        const saveCotContentBtn = document.getElementById('save-cot-content-btn');
        const loadDefaultCotBtn = document.getElementById('load-default-cot-btn');
        const clearCotContentBtn = document.getElementById('clear-cot-content-btn');
        const cotContentTextarea = document.getElementById('cot-content-textarea');
        const cotPositionSelect = document.getElementById('cot-position-select');
        const cotAutoInjectCheckbox = document.getElementById('cot-auto-inject-checkbox');
        
        if (toggleCotBtn) {
            toggleCotBtn.addEventListener('click', () => {
                if (window.JCYCOTProcessor) {
                    window.JCYCOTProcessor.toggleCOT();
                    updateCOTStatusDisplay();
                }
            });
        }
        
        if (saveCotContentBtn) {
            saveCotContentBtn.addEventListener('click', () => {
                if (window.JCYCOTProcessor && cotContentTextarea) {
                    window.JCYCOTProcessor.updateCOTContent(cotContentTextarea.value);
                    showCustomAlert('成功', 'COT內容已保存');
                }
            });
        }
        
        if (loadDefaultCotBtn) {
            loadDefaultCotBtn.addEventListener('click', () => {
                if (cotContentTextarea) {
                    // 預設的COT內容
                    const defaultCOTContent = `請按照以下步驟進行思考：

1. 分析問題：仔細理解用戶的問題或需求
2. 制定計劃：確定解決問題的步驟和方法
3. 執行計劃：按照計劃逐步執行
4. 檢查結果：驗證結果是否正確
5. 總結反思：總結經驗教訓

請在回答時遵循這個思維鏈，確保邏輯清晰、步驟明確。`;

                    cotContentTextarea.value = defaultCOTContent;
                    showCustomAlert('成功', '預設COT內容已載入');
                }
            });
        }
        
        if (clearCotContentBtn) {
            clearCotContentBtn.addEventListener('click', () => {
                if (cotContentTextarea) {
                    cotContentTextarea.value = '';
                    showCustomAlert('成功', 'COT內容已清空');
                }
            });
        }
        
        if (cotPositionSelect) {
            cotPositionSelect.addEventListener('change', () => {
                if (window.JCYCOTProcessor) {
                    window.JCYCOTProcessor.updateCOTSettings({
                        position: cotPositionSelect.value
                    });
                }
            });
        }
        
        if (cotAutoInjectCheckbox) {
            cotAutoInjectCheckbox.addEventListener('change', () => {
                if (window.JCYCOTProcessor) {
                    window.JCYCOTProcessor.updateCOTSettings({
                        autoInject: cotAutoInjectCheckbox.checked
                    });
                }
            });
        }
        
        // 初始化顯示
        updateCOTStatusDisplay();
        loadCOTContentToTextarea();
    }
    
    // 更新COT狀態顯示
    function updateCOTStatusDisplay() {
        if (!window.JCYCOTProcessor) return;
        
        const statusText = document.getElementById('cot-status-text');
        const positionText = document.getElementById('cot-position-text');
        const toggleBtn = document.getElementById('toggle-cot-btn');
        
        if (statusText) {
            statusText.textContent = window.JCYCOTProcessor.isEnabled() ? '啟用' : '停用';
        }
        
        if (positionText) {
            const settings = window.JCYCOTProcessor.getCOTSettings();
            positionText.textContent = settings.position === 'before' ? 'VN提示前' : 'VN提示後';
        }
        
        if (toggleBtn) {
            toggleBtn.textContent = window.JCYCOTProcessor.isEnabled() ? '停用' : '啟用';
        }
    }
    
    // 載入COT內容到文本框
    function loadCOTContentToTextarea() {
        if (!window.JCYCOTProcessor) return;
        
        const cotContentTextarea = document.getElementById('cot-content-textarea');
        const cotPositionSelect = document.getElementById('cot-position-select');
        const cotAutoInjectCheckbox = document.getElementById('cot-auto-inject-checkbox');
        
        if (cotContentTextarea) {
            cotContentTextarea.value = window.JCYCOTProcessor.getCOTContent();
        }
        
        if (cotPositionSelect) {
            const settings = window.JCYCOTProcessor.getCOTSettings();
            cotPositionSelect.value = settings.position;
        }
        
        if (cotAutoInjectCheckbox) {
            const settings = window.JCYCOTProcessor.getCOTSettings();
            cotAutoInjectCheckbox.checked = settings.autoInject;
        }
    }
    
    // 監聽COT管理界面顯示事件
    document.addEventListener('showScreen', function(event) {
        if (event.detail === 'cot-management-screen') {
            setTimeout(() => {
                updateCOTStatusDisplay();
                loadCOTContentToTextarea();
            }, 100);
        }
    });
    
    // 初始化COT管理
    setTimeout(() => {
        initCOTManagement();
    }, 1000);
        window.closeVNHistoryViewer = closeVNHistoryViewer;
        window.loadVNStoryFromHistory = loadVNStoryFromHistory;
        window.deleteVNStoryFromHistoryUI = deleteVNStoryFromHistoryUI;
        window.showVNStoryDetails = showVNStoryDetails;


        init();
    });

// ▼▼▼ @功能實現 ▼▼▼
/**
 * 初始化@功能
 * @param {HTMLElement} chatInput - 聊天輸入框元素
 */
function initMentionFeature(chatInput, state) {
    let mentionDropdown = null;
    let currentMentionFilter = '';
    let mentionableUsers = [];
    
    // 創建@下拉選單
    function createMentionDropdown() {
        if (mentionDropdown) {
            mentionDropdown.remove();
        }
        
        mentionDropdown = document.createElement('div');
        mentionDropdown.id = 'mention-dropdown';
        mentionDropdown.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
            min-width: 150px;
        `;
        
        document.body.appendChild(mentionDropdown);
    }
    
    // 獲取當前聊天中可@的用戶
    function getMentionableUsers() {
        if (!state.activeChatId || !state.chats[state.activeChatId]) {
            return [];
        }
        
        const chat = state.chats[state.activeChatId];
        const users = [];
        
        // 添加當前聊天對象
        if (!chat.isGroup) {
            users.push({
                name: chat.name,
                id: chat.id,
                avatar: chat.settings.aiAvatar || 'https://i.postimg.cc/2SwjsfZQ/IMG-6913.gif'
            });
        } else {
            // 群聊：添加"所有人"選項（置頂）
            users.push({
                name: '所有人',
                id: 'everyone',
                avatar: 'https://i.postimg.cc/2SwjsfZQ/IMG-6913.gif',
                isEveryone: true
            });
            
            // 添加群成員
            if (chat.members && chat.members.length > 0) {
                chat.members.forEach(member => {
                    users.push({
                        name: member.name || member.id,
                        id: member.id,
                        avatar: member.avatar || 'https://i.postimg.cc/2SwjsfZQ/IMG-6913.gif'
                    });
                });
            }
            
            // 添加群主/管理員
            if (chat.settings.groupOwner) {
                users.push({
                    name: chat.settings.groupOwner,
                    id: 'group_owner',
                    avatar: chat.settings.groupAvatar || 'https://i.postimg.cc/2SwjsfZQ/IMG-6913.gif'
                });
            }
        }
        
        // 添加自己
        users.push({
            name: state.qzoneSettings.nickname || '我',
            id: 'user',
            avatar: state.qzoneSettings.avatar || 'https://i.postimg.cc/2SwjsfZQ/IMG-6913.gif'
        });
        
        return users;
    }
    
    // 更新@下拉選單內容
    function updateMentionDropdown(filter = '') {
        if (!mentionDropdown) return;
        
        mentionableUsers = getMentionableUsers();
        const filteredUsers = mentionableUsers.filter(user => 
            user.name.toLowerCase().includes(filter.toLowerCase())
        );
        
        mentionDropdown.innerHTML = '';
        
        if (filteredUsers.length === 0) {
            mentionDropdown.innerHTML = '<div style="padding: 10px; color: #666; text-align: center;">沒有找到匹配的用戶</div>';
        } else {
            filteredUsers.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'mention-item';
                
                // 為"所有人"選項添加特殊樣式
                const isEveryone = user.isEveryone;
                userItem.style.cssText = `
                    padding: 8px 12px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border-bottom: 1px solid #f0f0f0;
                    ${isEveryone ? 'background-color: #f8f9fa; font-weight: bold;' : ''}
                `;
                userItem.innerHTML = `
                    <img src="${user.avatar}" alt="${user.name}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                    <span style="${isEveryone ? 'color: #007bff;' : ''}">@${user.name}</span>
                `;
                
                userItem.addEventListener('click', () => {
                    insertMention(user.name);
                    hideMentionDropdown();
                });
                
                userItem.addEventListener('mouseenter', () => {
                    userItem.style.backgroundColor = '#f5f5f5';
                });
                
                userItem.addEventListener('mouseleave', () => {
                    userItem.style.backgroundColor = 'transparent';
                });
                
                mentionDropdown.appendChild(userItem);
            });
        }
    }
    
    // 顯示@下拉選單
    function showMentionDropdown() {
        if (!mentionDropdown) {
            createMentionDropdown();
        }
        
        const rect = chatInput.getBoundingClientRect();
        mentionDropdown.style.left = rect.left + 'px';
        mentionDropdown.style.top = (rect.top - mentionDropdown.offsetHeight - 5) + 'px';
        mentionDropdown.style.display = 'block';
        
        updateMentionDropdown(currentMentionFilter);
    }
    
    // 隱藏@下拉選單
    function hideMentionDropdown() {
        if (mentionDropdown) {
            mentionDropdown.style.display = 'none';
        }
        currentMentionFilter = '';
    }
    
    // 插入@用戶名
    function insertMention(username) {
        const cursorPos = chatInput.selectionStart;
        const textBefore = chatInput.value.substring(0, cursorPos);
        const textAfter = chatInput.value.substring(cursorPos);
        
        // 找到@符號的位置
        const atIndex = textBefore.lastIndexOf('@');
        if (atIndex === -1) return;
        
        // 替換@和過濾文字為@用戶名
        const newText = textBefore.substring(0, atIndex) + '@' + username + ' ' + textAfter;
        chatInput.value = newText;
        
        // 設置游標位置
        const newCursorPos = atIndex + username.length + 2; // +2 for @ and space
        chatInput.setSelectionRange(newCursorPos, newCursorPos);
        chatInput.focus();
    }
    
    // 監聽輸入事件
    chatInput.addEventListener('input', (e) => {
        const value = chatInput.value;
        const cursorPos = chatInput.selectionStart;
        const textBefore = value.substring(0, cursorPos);
        
        // 檢查是否正在輸入@
        const atMatch = textBefore.match(/@([^@\s]*)$/);
        if (atMatch) {
            currentMentionFilter = atMatch[1];
            showMentionDropdown();
        } else {
            hideMentionDropdown();
        }
    });
    
    // 監聽鍵盤事件
    chatInput.addEventListener('keydown', (e) => {
        if (mentionDropdown && mentionDropdown.style.display === 'block') {
            if (e.key === 'Escape') {
                hideMentionDropdown();
                e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const items = mentionDropdown.querySelectorAll('.mention-item');
                const currentIndex = Array.from(items).findIndex(item => 
                    item.style.backgroundColor === 'rgb(245, 245, 245)'
                );
                
                let nextIndex;
                if (e.key === 'ArrowDown') {
                    nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
                } else {
                    nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
                }
                
                items.forEach((item, index) => {
                    item.style.backgroundColor = index === nextIndex ? '#f5f5f5' : 'transparent';
                });
            } else if (e.key === 'Enter' && !e.shiftKey) {
                const selectedItem = mentionDropdown.querySelector('.mention-item[style*="background-color: rgb(245, 245, 245)"]');
                if (selectedItem) {
                    e.preventDefault();
                    const username = selectedItem.querySelector('span').textContent.substring(1); // 移除@符號
                    insertMention(username);
                    hideMentionDropdown();
                }
            }
        }
    });
    
    // 點擊其他地方隱藏下拉選單
    document.addEventListener('click', (e) => {
        if (mentionDropdown && !mentionDropdown.contains(e.target) && e.target !== chatInput) {
            hideMentionDropdown();
        }
    });
    
    // 初始化下拉選單
    createMentionDropdown();
}

// ▲▲▲ @功能實現結束 ▲▲▲

// 遷移世界書數據（為舊數據添加新字段的默認值）
async function migrateWorldBooksData() {
    try {
        console.log('[JCY] 開始遷移世界書數據...');
        
        let hasChanges = false;
        
        // 確保state變量可用
        if (typeof state === 'undefined' || !state || !state.worldBooks) {
            console.warn('[JCY] state.worldBooks 不可用，跳過遷移');
            return;
        }
        
        for (const worldBook of state.worldBooks) {
            let updated = false;
            
            // 檢查並添加缺失的字段
            if (!worldBook.hasOwnProperty('priority')) {
                worldBook.priority = '普通';
                updated = true;
            }
            
            if (!worldBook.hasOwnProperty('trigger')) {
                worldBook.trigger = 'Always On';
                updated = true;
            }
            
            if (!worldBook.hasOwnProperty('keywords')) {
                worldBook.keywords = '';
                updated = true;
            }
            
            if (!worldBook.hasOwnProperty('category')) {
                worldBook.category = '備註';
                updated = true;
            }
            
            // 如果有更新，保存到數據庫
            if (updated) {
                await db.worldBooks.put(worldBook);
                hasChanges = true;
                console.log(`[JCY] 已更新世界書 "${worldBook.name}" 的數據結構`);
            }
        }
        
        if (hasChanges) {
            console.log('[JCY] 世界書數據遷移完成');
            // 通知VN面板世界書數據已更新
            if (typeof notifyVNPanelWorldBooksUpdated === 'function') {
                notifyVNPanelWorldBooksUpdated();
            }
        } else {
            console.log('[JCY] 世界書數據無需遷移');
        }
        
    } catch (error) {
        console.error('[JCY] 世界書數據遷移失敗:', error);
    }
}
