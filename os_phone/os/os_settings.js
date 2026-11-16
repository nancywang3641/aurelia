// ----------------------------------------------------------------
// [檔案] os_settings.js (V6.0.0 - Aurelia Style, Sync Primary URL & Factory Reset)
// 職責：管理 PhoneOS 全域設定
// 修改：
// 1. 全面套用 Aurelia 核心 CSS (拿鐵色/流金/磨砂玻璃)，統一系統視覺。
// 2. 副模型新增「同步主模型 API 端點」拉桿，自動繼承 URL/Key。
// 3. 🔥 新增：核彈級「一鍵格式化」雙重確認清空數據功能。
// ----------------------------------------------------------------
(function() {
    // ❔ 設定旁邊問號點開的說明（AUI.helpBtn），面板上不掛說明文字；鍵名 ss_＋當初那段說明在的行號，只是名字
    function _regHelp() {
        const A = window.AUI || (window.parent && window.parent.AUI);
        if (!A || !A.registerHelp) return false;
        A.registerHelp({
            ss_1249: { title: '用酒館的連線', body: '關掉就用下面自己填的網址與金鑰。' },
            ss_1269: { title: '請求格式', body: '回覆被站整段攔掉（內容為空、content_filter）時，換成 Gemini 原生：這個格式會附上「安全過濾全關」，跟酒館送 Google 的一樣。\n接 Claude 官方（或支援 Claude 格式的站）選 Claude 原生：同一段開頭再送一次時會讀緩存，比較省。OpenAI 相容這個格式接 Claude 沒有緩存。\n用 Google Cloud 的 Vertex（現在叫 Agent Platform）：選「Gemini 原生／Vertex」，API 地址填 https://aiplatform.googleapis.com，Key 填「綁在服務帳戶上」的 API 金鑰（Google Cloud 建金鑰時先在「選取 API 限制」選 Agent Platform API，再綁一個有「Agent Platform 使用者」角色的服務帳戶；一般的金鑰 Vertex 不收）。建金鑰時說被組織政策擋住：到「組織政策」找 iam.managed.disableServiceAccountApiKeyCreation，在 allowedServices 多加一行 aiplatform.googleapis.com。\n這種金鑰拉不到模型清單，模型選單最下面選「自己輸入模型名稱」，照 Vertex 上的寫（例如 gemini-3.1-pro-preview）。會先想的模型想的也算在 Max Tokens 裡，寫劇情建議 16000 以上。下載下來的那種 JSON 鑰匙檔網頁版用不了，只有酒館收。' },
            ss_1278: { title: '自訂前置指令', body: '這段會放在主模型每次收到的訊息最前面。直連、托管、酒館連線都有效；用酒館連線時每個連接預設各記一份。\n留空就不放。' },
            ss_1298: { title: '注入 Preset 自訂條目', body: '把你挑的那個 Preset 裡自己寫的條目，放進主模型的指令裡。要裝酒館助手才有。' },
            ss_1354: { title: '用酒館的連線', body: '關掉就用下面自己填的網址與金鑰。' },
            ss_1367: { title: '同步主模型 URL 與 Key', body: '共用主模型的網址與密鑰。' },
            ss_1381: { title: '請求格式', body: '同步主模型時跟主模型走。' },
            ss_1402: { title: '自訂前置指令', body: '這段會放在副模型每次收到的訊息最前面。\n留空就不放。' },
            ss_1452: { title: '看圖', body: '手機裡傳的照片、頭像、記事本和微博的照片，要不要讓模型看。聊天的模型看不到圖，就選交給看圖小模型，再到下面把「看圖小模型」指到一條看得到圖的連線。' },
            ss_1458: { title: '哪件事走哪個模型', body: '沒動過就跟以前一樣：正文、手機聊天、大總結走主模型，其餘走副模型。要分開再加通道。' },
            ss_1464: { title: '我的通道', body: '主模型、副模型以外的連線，加幾條都行；加完回上面指定哪件事用它。' },
            ss_jev: { title: '決策模型', body: '只做選擇題、打分數、回答是或不是的小模型，快又便宜，一次不到台幣 0.001 元。\n\n用到它的地方：書咖的丹決定下一步、立繪什麼時候收、音效和音樂、劇情地點對到地圖、記憶比對。\n\n要用 Jev 那種問法的服務。三格都要填；少一格，那些地方照舊用自己原本的辦法。\n\n只存在這台裝置上，電腦和手機要各填一次。' },
            ss_1503: { title: '頭像 來源', body: '角色頭像／立繪用這個來源。' },
            ss_1519: { title: '立繪模式', body: '開＝直接生全身立繪、不生頭像。' },
            ss_trio: { title: '一次生三種', body: '只在立繪模式下有作用：勾了會順便勾上面的「跳過頭像」，取消「跳過頭像」它也會一起取消。新角色要圖時，一次生一張分三格的圖，切開成三張：\n\n・立繪（去背）：劇情舞台\n・頭像（自拍，留背景）：聊天、劇情手機、通話、大廳對話框、日誌、狀態面板\n・Q版（去背）：大廳裡他的小人（裝扮室換過造型的照舊）。Q版那格畫成正面、側面、背面三隻並排的，會切成三張，他在大廳走路、轉向時會換成那一面\n\n提示詞有兩格，用哪格看「立繪」那列接的是什麼：接自訂接口（GPT 那種）用上面那格，會附上分三格的底圖讓它照著排；接其他的（ComfyUI、NAI…）用下面那格，不附底圖（試過附了反而會把底圖的人帶過來）。兩格內建的都是畫一隻站著的 Q版。\n\n開了這個，上面「一次生幾個角色」就不用了。已經有圖的舊角色不會重生。' },
            ss_1551: { title: '插圖 來源', body: '場景插圖／CG 用這個來源。' },
            ss_1566: { title: '小地圖 來源', body: '場景俯視小地圖底板用這個來源。ComfyUI 的模型／預設在下面「這組設定用於」選「小地圖」。' },
            ss_1589: { title: '畫風預設包', body: 'ComfyUI 畫房間時用哪個預設包。只列得出整房重繪那種模型的包。選好就生效。' },
            ss_img_uses: { title: '每個地方用什麼', body: '一列是一個會生圖的地方。先選「接口」，第二格就列那個接口自己的東西：NAI、ComfyUI 列它們的預設包；自訂接口列「自訂接口」那頁的畫風；酒館照酒館那邊的設定。選了就存，不用按底部保存。\n\n照原本的＝還沒換過，照改版前那套走。' },
            ss_img_styles: { title: '我的畫風', body: '一包是一段底詞加一段負詞，可以再放一張底圖。以前這頁的底詞包和底詞格也併進來了（11-17）。「畫風」頁每個選了自訂接口的地方挑一包，好幾個地方可以用同一包。NAI、ComfyUI 的長相寫在它們自己的預設包裡，不用這裡的畫風。' },
            ss_img_style_ref: { title: '底圖', body: '給生圖參考畫風用的一張圖。只有自訂接口收得到參考圖，其他接口會略過。' },
            ss_img_test: { title: '試畫一張', body: '選一個地方，照那一列現在的設定畫一張。ComfyUI 的預設包要先存好才試得到。' },
            ss_cfd_edit: { title: '預設包', body: '下面這些欄位就是 ComfyUI「目前的設定」。按底部「保存所有設定」存的是它，不會動到任何預設包。\n\n選一個包，欄位就換成那個包的內容。下拉直接選，或按「看圖挑」看著預覽圖按「套用」，兩個是一樣的；匯入、匯出、拖圖建包也在看圖挑那個窗裡。改完按「存回這個包」才會改到那個包；按「另存新的包」存成新的一個。選了包再按底部保存，目前的設定就變成畫面上這一份。\n\n哪個地方用目前的設定、哪個地方用哪個包，在「畫風」頁選。' },
            ss_room_style: { title: '房間畫風', body: '用自訂接口畫房間時用哪個畫風。\n\n按「新增」取個名字，再寫這個畫風長什麼樣子，存好就會選上它。「修改」「刪除」是對上面選著的那一個。\n\n選「照圖片設置的底詞」就跟以前一樣，用圖片設置裡填的那段。' },
            ss_room_route: { title: '房間用哪個接口畫', body: 'ComfyUI：原本那套。家具是畫在圖上的，小人走得過去。\n\n自訂接口・一次：只畫整間房，家具一樣走得過去。比兩次省一半。\n\n自訂接口・兩次：第一次畫整間房，第二次讓它把家具和能踩的地板各塗一個顏色，之後小人會被家具擋住、繞過去走，地板照它畫的範圍走。量家具那次要照著畫好的房間描，建議用官方的；畫房間那次可以用便宜的。\n\n選好就生效，下次配送或重新生成時用。已經畫好的房間不會自己重畫。' },
            ss_1616: { title: '世界門旅人畫風', body: '生一次就存著，之後進大廳直接是本人。單一個想重畫，右鍵那位→裝扮室。' },
            ss_dress_pack: { title: '大廳的小人', body: '角色中心「裝扮」那頁的「生成單張立姿圖」「生成走路圖」用哪個預設包來畫，在這裡各選一包，選一次就好。\n\n・單張立姿圖：選畫 Q版小人的那一包。\n・走路圖：要選會畫出 3×4 走路圖的那一包（例如掛了 RPG 角色走路圖 LoRA 的包）；一般的包只會畫出一張，用它生走路圖會切不開。\n\n預設包在上面 NAI、ComfyUI 那兩頁存。自己上傳圖片換小人不用選這個。\n\n「生成不倒翁小人」用哪組接口、要不要加畫風，在最上面「每個地方用什麼」的「不倒翁小人」那一列選；它自己一列，不會跟著立繪的畫風走。接自訂接口（GPT 那種）時照下面那格提示詞畫一張三隻（正面、側面、背面），並且每次都附上一張內建的小人樣張，讓它照樣張的畫法畫（不用開接口頁的「帶參考圖」，那個開關只管插圖）；接其他的照那組自己的底詞畫一隻。' },
            ss_1627: { title: '同步角色來源', body: '開啟後，背景和角色用同一個來源，不用再貼一次帳號。' },
            ss_1652: { title: '背景尺寸', body: '全部是 NAI 免費尺寸（64 倍數、未超上限、不扣點），任一接口都能用。' },
            ss_1733: { title: 'Flux 專用搭配檔', body: 'CFG 自動＝1、引導靠 Guidance；上面「模型」要選 diffusion_models 裡的 Flux（按測試會自動列出）。' },
            ss_1741: { title: 'Anima 專用搭配檔', body: '自然語言提示詞、CFG 自動≈4、採樣 er_sde/simple；上面「模型」要選 diffusion_models 裡的 anima-base（按測試會自動列出）。' },
            ss_1777: { title: '場景插圖品質', body: '需 ComfyUI 裝 Impact Pack（你已裝）。場景小臉/遠景眼睛會清楚很多，代價是每張場景多花十幾秒。' },
            // 10-06：09-19 把段落說明搬進小問號時，沒掛在欄位上的三段被掛到前一個欄位（酒館那頁的說明跑到 ComfyUI 工作流模式、
            //   自訂接口位址那段跑到底詞、Pollinations 模型掛了一段早就拆掉的分頁說明）；各自換回欄位自己的那句，搬走的放回原處。
            ss_1809: { title: '工作流模式', body: '想用自己的工作流再開，否則不用碰。' },
            ss_tavern_sd: { title: '酒館的生圖', body: '用酒館原生「圖像生成」擴展的後端生圖（你在那邊設好的 WebUI / ComfyUI / NAI / Horde…）。這頁沒有要填的，下面那行是酒館那邊現在選的後端。提示詞交給你的後端＋酒館共用前綴處理，奧瑞亞不額外加底詞。前提：先在酒館「圖像生成」擴展設好一個後端來源；沒設好會跳提示，不會偷偷換成別的來源。手機版沒有酒館，這條用不了。' },
            ss_1878: { title: '帶參考圖', body: '插圖附上出場角色的立繪，最多四個。只用角色中心裡你放的圖。' },
            ss_capi_url: { title: '接口位址', body: '貼站方給的位址就好，兩種送法會自己認：網址帶 /sdapi 走 Stable Diffusion 那種（模型不用填），其餘走 OpenAI 那種（要填模型）。跟其他接口都不是同一種送法，所以各佔一格、不能只換網址。' },
            ss_1893: { title: '底詞', body: '選填，可空。接在每張提示詞後面一起送出，畫風寫在這裡就不必靠副模型每次記得寫。' },
            ss_1919: { title: '防超免費尺寸', body: '超過免費上限自動縮回。' },
            ss_2095: { title: '場景插圖', body: '設定套用於所有場景插圖。' },
            ss_2116: { title: '場景插圖尺寸', body: '插圖底詞／負詞跟著上面選的「插圖來源」走該接口那份；跟頭像同接口時就是同一份。在接口設定區調整即可。' },
            ss_2125: { title: '自動插圖', body: '每輪記憶抽取時順便吐插圖、自動生圖。' },
            ss_2130: { title: '角色名佔位', body: '副模型只寫 ##角色名##＋動作場景，外觀由系統用頭像自動填。' },
            ss_2144: { title: '獨立插圖副模型', body: '插圖另開一通副模型（用副模型接口）、只吃下方規範、不背 AVS/記憶；開了上面的搭便車插圖就停。' },
            ss_2188: { title: '角色頭像快取', body: '備份後即使本地快取清空，也能從角色卡世界書讀回、不必重生（寫入當前角色卡主世界書，停用條目不進 AI）。' },
            bk_storage: { title: '這台裝置上的空間', body: '奧瑞亞的資料（劇情、聊天、圖片）都存在這台裝置的瀏覽器裡，瀏覽器會給一個上限。佔最多的通常是圖片。用到一半橘色、八成紅色。空間吃緊時，瀏覽器可能把整個站的資料一起清掉，不只是圖；「受保護」之後它就不會自己動手。不管有沒有受保護，定期匯出一份完整備份最保險。' },
            bk_export_img: { title: '帶圖片', body: '聊天裡傳的照片和語音、好友頭像、聊天背景、朋友圈和記事本的照片、角色中心裡放的圖、畫風參考圖會一起放進備份檔，換手機或格式化之後還原都回得來。圖片多的話檔案會大很多；如果手機匯出到一半整頁重開，取消這個勾再匯出一次（文字的部分照樣完整）。雲端自動備份不帶圖片。劇情插圖和立繪在另一個圖庫，不在備份裡。' },
            bk_export_secrets: { title: '帶 API 金鑰', body: '預設不帶：備份檔裡會挖掉 API 金鑰、通行碼那些，檔案傳給別人也不會漏。其他設定照樣帶。\n\n只有自己換手機、換電腦，想連金鑰一起搬過去時才勾。還原沒帶金鑰的備份時，這台原本填好的金鑰會留著，不會被清掉。' },
            ss_2250: { title: '已存立繪', body: '純色去背：本機瞬間完成，適合純色背景（NAI 圖用這個）。AI 去背：首次下載模型約 40MB，適合雜背景。立繪存進當前世界，VN 優先讀取。' },
            ss_2272: { title: '語音轉文字', body: '微信輸入框按住說話、電話直接說話都用這個。手機自己的聽寫不用下載，說的話會交給 Apple 或 Google 轉成字；本機模型的聲音不離開手機，第一次要下載約 250MB。' },
            ss_2308: { title: 'Group ID (必填)', body: '登入 Minimax 平台後，在帳號設定頁面可找到 Group ID。' },
            ss_2349: { title: '角色配音', body: '一格寫名字、選聲音。名字或任何一個別名對得上（大小寫不分），他講話就用這個聲音念。同一個角色可以放好幾格、各選一種語言（例如中文用 Minimax、英文用 ElevenLabs），每句會先看是什麼語言再挑那一格；對不上就用「不限」那格。聲音要先到「雲端」分頁填金鑰、按「抓我的聲音」才選得到。' },
            ss_vfor_on: { title: '外語角色', body: '打開後，下面名單上的角色在劇情裡會用他的語言講話，對話框下面一行小字放中文翻譯；語音只念原文。關著就跟以前一樣，大家都講中文，也不會多花錢。' },
            ss_vfor_list: { title: '誰講外語', body: '名字要跟劇情裡出現的角色名字一樣，名單上沒有的人照常講中文。想讓他用外國人的聲音念，到「語音 → 角色配音」幫他加一張同語言的卡。' },
            ss_vc_master: { title: '角色說話的聲音', body: '關掉就全部不念。開著的時候：角色配音名單上的人用他綁的聲音念，其他人照「沒在名單上的人」那格。' },
            ss_vc_others: { title: '沒在名單上的人', body: '隨機 NPC、路人這些沒綁聲音的人。選「本機念」就交給「本機」分頁設定的音色；選「不念」就只顯示字，不花錢也不佔顯卡。' },
            ss_mm_mine: { title: '我的聲音', body: '你在 Minimax 複製或設計的聲音。按「抓我的聲音」抓下來，角色配音的下拉選單就選得到。官方內建的聲音在「瀏覽官方音色庫」裡，按「加進名單」直接變成一格角色。' },
            ss_el_key: { title: 'ElevenLabs 金鑰', body: '在 ElevenLabs 網站左邊選單「開發者 → API Keys」建立。權限開「文字轉語音」跟「聲音（讀取）」就夠了，也可以幫這把金鑰設用量上限。' },
            ss_el_model: { title: '模型', body: 'v4 最自然，會照角色當下的表情在句子前面加語氣（像是笑、嘆氣、小聲說）。Multilingual v2 跟 Flash 不吃語氣，只照字念。' },
            ss_2413: { title: '顯示位置', body: '換了要重整酒館才會挪過去。' },
            ss_2420: { title: '高度', body: '100 就是跟對話框一樣高。調矮的話窗留在正中間，上下兩截露出聊天，改完當場就變。' },
            ss_2428: { title: '訊息可收合', body: '為每則訊息加上收合按鈕，太長的訊息可以收起來。' },
            ss_2443: { title: '回覆交給伺服器跑', body: '開了之後按送出就可以切出去或鎖屏，回覆由伺服器跑完再通知你。只對「直連 API」有效，跟著酒館的那種不行。' },
            ss_2455: { title: '沒有伺服器的守候', body: '沒填上面那個網址的時候用這個：想辦法讓手機別把奧瑞亞凍起來，角色才會在你沒看的時候開口。三招各自獨立，開一個就有效果。這台做不到的那一招會自己淡掉。' },
            ss_2462: { title: '當成在放音樂', body: '播一段完全沒有聲音的音軌，手機就會把奧瑞亞當成音樂 app 留著，鎖屏還會出現一張播放卡。你自己正在放的音樂會被停掉。' },
            ss_2470: { title: '螢幕不要自己關', body: '畫面亮著的時候不讓它自動暗掉，同時讓背景的計時器繼續走。比較耗電。' },
            ss_2476: { title: '開一個小窗守著', body: '推出一個浮在最上面的小窗，上面寫著已經守了多久。小窗還在，這一頁就不會被凍起來。' },
            ss_2486: { title: '有人找你就通知', body: '你沒在看的時候有人開口，就在手機上叮一下。第一次打開會問你要不要允許通知。' },
            ss_2499: { title: '手機通知', body: '丹自己醒來寫紙條的時候叮你一下，點通知直接回到板子。' },
            ss_2515: { title: '介面佈局', body: '頂部被遮擋時選「強制下移」。' },
            ss_2549: { title: '本地備份', body: '把資料匯出成一個 JSON 檔，存到相簿、iCloud 或雲端硬碟。全部勾著就是完整備份；只想帶一部分就把其他塊的勾取消。「設定」那塊有 API 金鑰，勾著匯出前會再提醒一次。還原時按「從本地 JSON 還原」，檔案裡有哪幾塊就還原哪幾塊。' },
            bk_local_st: { title: '奧瑞亞的資料備份', body: '只收奧瑞亞自己存的東西：劇情記憶和大總結、手機 app、狀態面板、大廳、創作室、成就，還有圖片、語音這些設定。\n\n聊天、角色卡、世界書、預設、正則是酒館在管的，用酒館自己的匯出就好，這裡不重複收。API 用酒館連線的話，那份設定也不收（金鑰在酒館那邊）。\n\n「設定」那塊有金鑰，勾著匯出前會再提醒一次。還原時按「從本地 JSON 還原」，完成會自己重新整理。' },
            ss_cloudbk: { title: '自動備份', body: '開著時，打開 app 距離上次超過一天就備份一次，切出 app 時也會補；內容沒變就不上傳。按「雲端的備份」可以挑一份還原。\n\n備份到哪裡二選一：\n・托管伺服器：用上面「回覆交給伺服器跑」的網址與通行碼，伺服器留最近七份。\n・GitHub 私人倉庫：沒有伺服器的人用，備份存在你自己的倉庫，只有你看得到；怎麼開看那格的小問號。\n\n不含圖片。勾哪幾塊就傳哪幾塊；「設定」裡有 API 金鑰，預設不傳。\n\n都不想開也沒關係：太久沒匯出時，打開 app 會問你要不要匯出一份。' },
            ss_cloudbk_gh: { title: 'GitHub 私人倉庫', body: '備份存在你自己的 GitHub 私人倉庫，只有你看得到。每備份一次就是一次更新，以前的版本 GitHub 會記著，「雲端的備份」列最近十份。\n\n第一次要做三件事：\n1. 在 GitHub 開一個新倉庫，選 Private（私人）。\n2. 到 GitHub 右上頭像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens，按 Generate new token。Repository access 選 Only select repositories，只選剛剛那個倉庫；Permissions 裡的 Contents 選 Read and write。產生後複製那串金鑰，它只會顯示一次。\n3. 這裡填「帳號/倉庫名」和那串金鑰。直接貼倉庫的網址也可以。\n\n金鑰存在這台裝置的瀏覽器裡。照第 2 步只開放那一個倉庫，萬一外流也只碰得到備份。' },
        });
        return true;
    }
    if (!_regHelp()) setTimeout(_regHelp, 1500);

    console.log('[PhoneOS] 載入系統設置模塊 (V6.0.0 Aurelia Style & Sync & Reset)...');
    // 樣式在 css/os_settings.css（酒館 loadCSS、PWA <link>）。以前這裡會把 #os-settings-css 換成 appStyle，
    // 可是 appStyle 早就抽走了，哪天頁面上剛好有那個 id 整支設定就會在這行斷掉，所以拿掉

    // 寫 localStorage 一律走這支：空間滿了不丟例外、會跳「○○沒存下來」，回 true／false 給呼叫的地方決定要不要報成功
    const _lsSet = (key, value, what) => (window.parent || window).AUI.lsSet(key, value, what);

    const LLM_STORAGE_KEY = 'os_global_config';
    const SEC_LLM_STORAGE_KEY = 'os_secondary_llm_config';
    const IMG_STORAGE_KEY = 'os_image_config';
    // 🎨 自訂接口的底詞包：[{ id, name, text }]。🚨 故意不放進 os_image_config.customApi——
    //    底部「儲存」會照畫面上那幾格整個重組 customApi，放裡面就會被那一下整份蓋掉。
    //    自己一個鍵，存包／刪包當下就寫，不必再按儲存。用 id 當身分，名字只是給人看的（ComfyUI 那套吃過名字＝身分的虧）。
    const CAPI_PACKS_KEY = 'os_img_capi_base_packs';
    function _capiPacks() {
        try { const v = JSON.parse(localStorage.getItem(CAPI_PACKS_KEY) || '[]'); return Array.isArray(v) ? v.filter(p => p && p.id) : []; }
        catch (e) { return []; }
    }
    function _capiPacksSave(list) { return _lsSet(CAPI_PACKS_KEY, JSON.stringify(list || []), '底詞包'); }
    function _capiEsc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    // 🔌 節點：同一種送法、不同的站（NovelAI 官方／公益站；GPT Image 官方／第三方）。[{ id, name, ...連線欄位 }]
    //    🚨 理由同底詞包，不放進 os_image_config：底部「儲存」會照畫面整份重組 novelai / customApi。
    //    正在用的那組照舊存在 os_image_config（生圖只讀那裡），節點只是「一鍵填回去」的清單。
    const IMG_NODE_KINDS = {
        nai:  { key: 'os_img_nai_nodes',  cfgKey: 'novelai',   idPrefix: 'nain_',  select: '#img-nai-node',  status: '#img-nai-node-status',
                fields: { url: '#img-nai-url', token: '#img-nai-token' } },
        capi: { key: 'os_img_capi_nodes', cfgKey: 'customApi', idPrefix: 'capin_', select: '#img-capi-node', status: '#img-capi-node-status',
                fields: { url: '#img-capi-url', apiKey: '#img-capi-key', model: '#img-capi-model', refImages: '#img-capi-ref' } },
    };
    // 開關類的欄位（帶參考圖）在節點裡存 '1'／''，跟文字格一樣比對；設定檔裡可能是 true/false，一律先換成字串
    const _nodeVal = (v) => (v === true ? '1' : (v === false || v == null ? '' : String(v).trim()));
    function _imgNodes(kind) {
        try { const v = JSON.parse(localStorage.getItem(IMG_NODE_KINDS[kind].key) || '[]'); return Array.isArray(v) ? v.filter(n => n && n.id) : []; }
        catch (e) { return []; }
    }
    function _imgNodesSave(kind, list) { return _lsSet(IMG_NODE_KINDS[kind].key, JSON.stringify(list || []), '節點清單'); }
    function _imgNodeMatches(kind, node, cur) {
        return Object.keys(IMG_NODE_KINDS[kind].fields).every(f => _nodeVal(node[f]) === _nodeVal(cur[f]));
    }
    // 下拉的選項：格子裡現在那組剛好等於哪個節點，就停在那個節點
    function _imgNodeOptionsHTML(kind, cur, pickId) {
        const nodes = _imgNodes(kind);
        const hit = nodes.find(n => _imgNodeMatches(kind, n, cur || {}));
        const on = pickId || (hit ? hit.id : '');
        return '<option value="">' + (nodes.length ? (on ? '節點…' : '目前這組還沒存') : '還沒有節點') + '</option>' +
            nodes.map(n => '<option value="' + _capiEsc(n.id) + '"' + (n.id === on ? ' selected' : '') + '>' + _capiEsc(n.name) + '</option>').join('');
    }
    const MINIMAX_STORAGE_KEY = 'os_minimax_config';
    
    // --- 讀取 LLM 設置 ---
    function loadLlmConfig() {
        let saved = localStorage.getItem(LLM_STORAGE_KEY);
        let config = { 
            url: '', key: '', model: 'gemini-3.1-pro-preview', 
            useSystemApi: true, stProfileId: '', 
            directMode: false, enableStreaming: false, disableTyping: false,
            useGenerateRaw: false,
            maxTokens: 2000, temperature: 1.0, top_p: 1.0, frequency_penalty: 0, presence_penalty: 0,
            usePresetPrompts: false, presetName: '', customCot: '', customCotMap: {},
            apiFormat: 'openai'   // 'openai'＝/v1/chat/completions；'gemini'＝/v1beta/models/…:generateContent（原生，附安全過濾全關）
        };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        _mergeTavernFlags(config);
        config._isSecondary = false;   // 源頭貼標：走主模型連線 → DEBUG 面板歸「主模型」類（全新物件，不共用）
        return config;
    }

    // 「跟隨酒館」與「🍎」原本是兩個開關，實際差別只在「沒選連接預設」時送的請求 body：
    // 🍎 那條是乾淨 body（不送 penalty，gemini/vertex 才不會 404），選了預設時兩條根本一樣。
    // → 併成一個開關「用酒館的連線」，內部兩個旗標一起走；舊設定只開了跟隨的自動補上 🍎。
    function _mergeTavernFlags(config) {
        if (config && config.useSystemApi) config.useGenerateRaw = true;
        return config;
    }

    // --- 讀取副模型 LLM 設置 (含 syncWithPrimary) ---
    function loadSecLlmConfig() {
        let saved = localStorage.getItem(SEC_LLM_STORAGE_KEY);
        let config = {
            url: '', key: '', model: 'gemini-3.7-flash',   // 11-13 換掉 1.5-flash（她副模型平常用這顆；酒館選單上 flash 最新也是它）
            useSystemApi: true, stProfileId: '', syncWithPrimary: true, // 🔥 預設開啟同步主模型
            directMode: false, enableStreaming: false, disableTyping: false,
            useGenerateRaw: false,
            maxTokens: 1000, temperature: 1.0, top_p: 1.0, frequency_penalty: 0, presence_penalty: 0,
            usePresetPrompts: false, presetName: '', customCot: '',
            apiFormat: 'openai'
        };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        _mergeTavernFlags(config);
        config._isSecondary = true;   // 源頭貼標：走副模型連線 → DEBUG 面板歸「副模型」類（全新物件，不共用）
        return config;
    }

    // ── 🔌 通道清單 ＋「哪件事走哪條」──────────────────────────────
    // 以前只有主／副兩條，所有事情被迫共用：大總結要吐七八千字、狀態抽取只要幾十個字、
    // 插圖只要照規範寫英文，卻全綁在同一個模型上。這裡讓她自己加通道，再指定哪件事走哪條。
    // 🚨 預設一律「跟隨主／副」＝行為跟以前完全一樣；她不去動就什麼都沒變。
    const LLM_CHANNELS_KEY = 'os_llm_channels';   // [{id,name,url,key,model,maxTokens,temperature,...}]
    const LLM_ROUTES_KEY = 'os_llm_routes';       // { 任務: 'main' | 'sec' | 通道id }

    // 對應表列的是「事情」不是「通道三」——她看得懂自己在調什麼，兩週後也還認得
    // 🚨 這份是唯一的名冊：每一個呼叫模型的地方都帶 options.task（＝這裡的 id），設置頁、控制台都照這份畫。
    //    加新功能＝這裡加一列＋呼叫時帶上 task，其他地方不用再對。
    //    def 填那個功能原本用主模型還是副模型：她沒改過的列，呼叫端自己組的設定一律原封不動（見 getRouteOverride）。
    const LLM_TASKS = [
        { group: '劇情',       id: 'story',        name: '正文（故事）',               def: 'main' },
        { group: '劇情',       id: 'summary',      name: '大總結',                     def: 'main' },
        { group: '劇情',       id: 'extract',      name: '狀態抽取 / 記憶 / 人物檔案', def: 'sec'  },
        { group: '劇情',       id: 'mem_tidy',     name: '整理舊記憶',                 def: 'sec'  },
        { group: '劇情',       id: 'illust',       name: '插圖描述',                   def: 'sec'  },
        { group: '劇情',       id: 'director',     name: '導演模式',                   def: 'main' },
        { group: '劇情',       id: 'avs_design',   name: '狀態欄位設計 / 整理',        def: 'main' },
        { group: '劇情',       id: 'npc_life',     name: '配角近況',                   def: 'sec'  },
        { group: '手機',       id: 'phone_chat',   name: '手機聊天',                   def: 'main' },
        { group: '手機',       id: 'call',         name: '電話',                       def: 'main' },
        { group: '手機',       id: 'wx_summary',   name: '聊天室記錄整理',             def: 'sec'  },
        { group: '手機',       id: 'wx_tidy',      name: '聊天室整理',                 def: 'sec'  },
        { group: '手機',       id: 'heartbeat',    name: '主動找我',                   def: 'sec'  },
        { group: '手機',       id: 'weibo',        name: '微博',                       def: 'main' },
        { group: '手機',       id: 'tarot',        name: '占卜',                       def: 'main' },
        { group: '手機',       id: 'apps',         name: '應用與組件裡的生成',         def: 'main' },
        { group: '手機',       id: 'studio',       name: '創作室',                     def: 'main' },
        { group: '手機',       id: 'phone_theme',  name: '手機主題',                   def: 'main' },
        { group: '手機',       id: 'vision',       name: '看圖小模型',                 def: 'sec'  },
        { group: '手機',       id: 'takeout',      name: '外送找店',                   def: 'sec'  },
        { group: '手機',       id: 'wx_theme',     name: '聊天 app 主題',              def: 'main' },
        { group: '手機',       id: 'wx_bubble',    name: '聊天泡泡',                   def: 'main' },
        { group: '大廳與世界', id: 'map',          name: '地圖探索',                   def: 'sec'  },
        { group: '大廳與世界', id: 'world_gen',    name: '世界 / 地圖事件 / 行程生成', def: 'main' },
        { group: '大廳與世界', id: 'world_plan',   name: '直接畫的世界地圖',           def: 'sec'  },
        { group: '大廳與世界', id: 'theater',      name: '小劇場',                     def: 'main' },
        { group: '大廳與世界', id: 'theater_note', name: '小劇場記事 / 角色記憶整理',  def: 'sec'  },
        { group: '大廳與世界', id: 'lobby_chat',   name: '大廳角色對話與小遊戲',       def: 'sec'  },
        { group: '大廳與世界', id: 'cafe',         name: '書咖',                       def: 'sec'  },
        { group: '大廳與世界', id: 'cafe_hire',    name: '書咖應聘（履歷、面試）',     def: 'sec'  },   // 一批應徵者的履歷一通、面試她每問一句一通（os_cafe_hire.js）
        { group: '大廳與世界', id: 'sn_board_video', name: '白板看影片／讀歌詞',         def: 'sec'  },   // SN 32 樓白板丟素材貼 YouTube 連結：有字幕先讀歌詞（純文字，主／副也行）；沒字幕才看影片——Gemini 原生通道或 OpenRouter 看得了，主／副多半看不了，所以沒指到通道就不看
        { group: '大廳與世界', id: 'npc_decide',   name: 'NPC 決定下一步（決策模型沒設好時）', def: 'sec'  },
        { group: '大廳與世界', id: 'estate',       name: '房產（租客 / 房間）',        def: 'sec'  },
        { group: '大廳與世界', id: 'blueprint',    name: '造物工坊',                   def: 'sec'  },
        { group: '大廳與世界', id: 'worldgate',    name: '世界門',                     def: 'sec'  },
        { group: '大廳與世界', id: 'pt',           name: 'PT 結算',                    def: 'sec'  },
        { group: '大廳與世界', id: 'achievement',  name: '成就估值',                   def: 'main' },
        { group: '大廳與世界', id: 'loot_eval',    name: '戰利品估值',                 def: 'main' },   // 視差撤離時選了換 PT 的東西，交易所白兔一次估完（os_pt.js evaluateLootPT）
        { group: '大廳與世界', id: 'store404',     name: '404 商店',                   def: 'main' },
        { group: '宿舍',       id: 'xiaoji',       name: 'API 小機',                   def: 'main' },
        // only:'sims'＝只有模擬市民模式（os_sims.js，網址帶 ?sims=1）才列出來；聊天本身走上面的「手機聊天」
        { group: '模擬市民',   id: 'sims_memory',  name: '市民記性（每輪背景整理記憶）', def: 'main', only: 'sims' }
    ];

    function loadChannels() {
        try {
            const raw = JSON.parse(localStorage.getItem(LLM_CHANNELS_KEY) || '[]');
            return Array.isArray(raw) ? raw.filter(c => c && c.id) : [];
        } catch (e) { return []; }
    }
    function saveChannels(list) {
        return _lsSet(LLM_CHANNELS_KEY, JSON.stringify(Array.isArray(list) ? list : []), '我的通道');
    }
    function loadRoutes() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(LLM_ROUTES_KEY) || '{}') || {}; } catch (e) { saved = {}; }
        const out = {};
        LLM_TASKS.forEach(t => { out[t.id] = saved[t.id] || t.def; });
        return out;
    }
    function saveRoutes(routes) {
        return _lsSet(LLM_ROUTES_KEY, JSON.stringify(routes || {}), '「哪件事走哪個模型」');
    }

    // 某件事實際該用哪組設定。指到已經被刪掉的通道就退回預設（不要整個不能跑）。
    function getConfigForTask(task) {
        const t = LLM_TASKS.find(x => x.id === task);
        const routes = loadRoutes();
        const pick = routes[task] || (t ? t.def : 'main');
        if (pick === 'main') return loadLlmConfig();
        if (pick === 'sec') return loadSecLlmConfig();
        const ch = loadChannels().find(c => c.id === pick);
        if (!ch) return (t && t.def === 'sec') ? loadSecLlmConfig() : loadLlmConfig();
        const base = (t && t.def === 'sec') ? loadSecLlmConfig() : loadLlmConfig();
        // 自訂通道＝直連：把連線那幾欄蓋掉，其餘（串流、思考鏈…）沿用同性質的預設
        const cfg = Object.assign({}, base, {
            url: ch.url || '', key: ch.key || '', model: ch.model || '',
            useSystemApi: false, useGenerateRaw: false, stProfileId: '',
            maxTokens: parseInt(ch.maxTokens) || base.maxTokens,
            temperature: isFinite(parseFloat(ch.temperature)) ? parseFloat(ch.temperature) : base.temperature,
            top_p: undefined, frequency_penalty: 0, presence_penalty: 0,   // 通道表單沒有這幾格：不沿用預設那頁的值（Sonnet 5.5 那類連 top_p 都不收，會整通退回），不送＝對方自己的預設
            apiFormat: ch.apiFormat || base.apiFormat || 'openai',          // 通道自己選的請求格式；沒選過的舊通道照舊沿用
            _channel: ch.id, _channelName: ch.name || ''
        });
        if (!cfg.url || !cfg.key) return base;   // 這條還沒填完 → 照舊走預設，不要讓她的對話整個斷掉
        return cfg;
    }
    // 中央 chat 用：這件事她有沒有改過走哪條。沒改過（或指到沒填完的通道）回 null＝呼叫端自己組的設定照舊；
    // 改過才回那條的設定，由 chat 換掉連線那幾欄。這樣名冊加一列、預設填對主／副，就不會改到任何既有行為。
    function getRouteOverride(task) {
        const t = LLM_TASKS.find(x => x.id === task);
        if (!t) return null;
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(LLM_ROUTES_KEY) || '{}') || {}; } catch (e) { saved = {}; }
        const pick = saved[task];
        if (!pick || pick === t.def) return null;
        const cfg = getConfigForTask(task);
        if (pick !== 'main' && pick !== 'sec' && !cfg._channel) return null;
        return cfg;
    }
    // 👁 看圖：她傳的照片、頭像、記事本照片、微博照片要怎麼讓模型「看」。
    //    off    ＝不送圖，模型只知道有一張照片（預設；接什麼模型都不會因為圖報錯）
    //    main   ＝聊天的模型自己看（模型本來就看得到圖，額度也不心疼）
    //    helper ＝先交給看圖小模型（名冊的 vision 那列）寫成一句話，聊天的模型只讀那句
    //    🚨 不能假設大家接的都是看得到圖的熱門模型：看不到圖的模型收到圖，有的整輪報錯、有的亂編。
    const VISION_MODE_KEY = 'os_vision_mode';
    const VISION_MODES = ['off', 'main', 'helper'];
    function getVisionMode() {
        let v = '';
        try { v = localStorage.getItem(VISION_MODE_KEY) || ''; } catch (e) {}
        return VISION_MODES.indexOf(v) >= 0 ? v : 'off';
    }
    function setVisionMode(v) {
        return _lsSet(VISION_MODE_KEY, VISION_MODES.indexOf(v) >= 0 ? v : 'off', '看圖設定');
    }

    // 給畫面用：這件事現在實際走誰（顯示名字）
    function routeLabel(task) {
        const routes = loadRoutes();
        const pick = routes[task];
        if (pick === 'main') return '主模型';
        if (pick === 'sec') return '副模型';
        const ch = loadChannels().find(c => c.id === pick);
        return ch ? (ch.name || '未命名通道') : '（通道已刪，走預設）';
    }

    // --- 讀取 Image 設置 ---
    // opts.defaults＝只要內建預設值、不讀存檔（插圖指令頁的「還原預設」用）
    function loadImageConfig(opts) {
        let saved = (opts && opts.defaults === true) ? null : localStorage.getItem(IMG_STORAGE_KEY);
        let config = {
            // 各桶的接口：2026-11-17 拿掉 Pollinations 之後預設是「還沒接」（空字串），新玩家要先在畫風頁選一個
            service: '',
            serviceInanimate: '', // 死物桶：背景/物品
            serviceLiving: '',    // legacy：舊「活物桶」(角色+插圖共用)，保留供遷移
            serviceChar: '',      // 頭像桶：char（角色頭像/立繪）
            serviceScene: '',     // 插圖桶：scene（場景插圖/CG）
            serviceMap: '',       // 小地圖桶：map（場景俯視底板）
            imgSourceSynced: true,            // 背景來源是否同步頭像（true＝沿用頭像接口）
            // 🌐 自訂接口：公益站／自架站那類 OpenAI 格式的生圖 API（送 JSON 回 JSON）。
            //    三格全部自己填，不內建站台清單——每個站支援的型號都不一樣，清單只會過期。
            customApi: { url: '', apiKey: '', model: '', quality: 'medium', basePrompt: '' },
            novelai: {
                token: '',
                url: 'https://image.novelai.net/ai/generate-image',
                model: 'nai-diffusion-3',
                capFreeSize: true,   // 🛡️ 防超免費尺寸（防誤扣 Anlas）
                sampler: 'k_euler_ancestral',
                scale: 5,
                steps: 28,
                ucPreset: 1,
                qualityToggle: true,
                smea: true,
                smeaDyn: false,
                charBasePrompt: '',
                charNegPrompt: '',
                itemBasePrompt: '',
                itemNegPrompt: '',
                naiPresets: []
            },
            sceneGen: {
                enabled: false,
                size: '1024x1024',

                sceneBasePrompt: '',
                sceneNegPrompt: 'worst quality, low quality, blurry, watermark, text, signature',
                specPrompt: `WHEN TO INSERT A SCENE
- Location changes or a new environment is established
- Significant emotional shift or dramatic turning point
- New character introduced with notable appearance
- Action, combat, or NSFW scene begins

PROMPT RULES (Danbooru-style tags, comma-separated, single line)

TAG ORDER:
1. Subject count: 1girl / 2boys / 1boy 1girl / etc.
   For 2+ characters: add one prose lock sentence describing spatial positions.
   e.g.: 2girls, a silver-haired girl on the left faces a dark-haired girl on the right,
2. Per character — use AND to separate multiple characters:
   [(adult:1.5), position, skin_tone, physique, eye_color, hair_desc, clothing, pose, expression]
3. Interaction / relationship tags (written outside character blocks)
4. Environment + lighting + camera: location, time_of_day, shot_type, angle

MULTI-CHARACTER RULES
- AND blocks for up to 2 focal characters only.
- 3+ characters: pick 2 focal, demote the rest to background_characters, depth_of_field.
- Give each focal character equal tag detail — do not simplify one to save space.
- Close contact or NSFW: remove left_side / right_side spatial tags.
- Always write (adult:1.5) as the very first tag inside each character block.

SHOT TYPES
Calm / dialogue : bust_shot or medium_shot, from_side or from_front
Action          : dynamic_angle, motion_blur, dutch_angle
Intimate / NSFW : close-up, from_above or from_side — no spatial position tags

EXAMPLE "prompt" value:
"2girls, a pale-skinned girl on the left reaches toward a tanned girl on the right, [(adult:1.5), left_side, pale_skin, gentle_vibe, long_silver_hair, soft_bangs, white_dress, reaching_out, worried_expression] AND [(adult:1.5), right_side, tanned_skin, calm_vibe, short_dark_hair, no_bangs, casual_jacket, stepping_back, neutral_expression], tense_atmosphere, dramatic_moment, rainy_street, night, from_side, medium_shot, shallow_depth_of_field"`,
                specTemplates: [],
                standaloneEnabled: false,   // 🎯 獨立插圖副模型：scenes 拆成單獨一通 chatSecondary、只吃 standaloneSpec、不背 AVS/記憶（原搭便車路保留給沒開的人）
                standaloneSpec: `把你的「完整插圖規範」整份貼進這裡（例如電影大師那份兩萬 token）。不用自己精簡——獨立通走免費副模型、token 不心疼，越完整越準。

系統會自動幫你對接（你規範不用改）：
① 只生插圖、不寫劇情正文。
② 已登記角色用 ##角色名## 或 ##代號##（如 ##C1##）代表（系統自動填外觀、跟頭像一致）；你的規範不用管這些角色的 DNA。
③ 規範裡的 {{}} 權重照常給 NAI、不受影響（佔位用的是井號 ##、跟 {{}} 不衝突）。
④ 自動輸出 scenes JSON、依編號段落定位。

（留空＝不啟用獨立插圖通。）`,
                extractEnabled: false,
                extractPrompt: `請依「最新這段正文」實際發生、看得到的畫面，輸出最多 2 張場景插圖。
- 只照正文「真的發生、畫得出來的畫面」畫，不要推理後續劇情、不要腦補角色心理或感情。
- 角色長相用你已知的角色狀態/設定(髮色、衣著等)，不要亂編；正文沒寫的外觀沿用設定。
- 多人場景：每個 prompt 只描述一個角色、各自標籤分開寫，不要讓 A 的衣服長到 B 身上。
- 每張圖的 prompt 是該畫面的 Danbooru 英文標籤、逗號分隔、單行。
- 找不到適合入畫的畫面就不要硬湊(回空)。
（插圖的「擺放位置」與 scenes 格式由系統自動處理，你只要照下方規則給 after_paragraph 數字即可。）`,
                // 🏷️ 標籤版（NAI / Danbooru）：移植自 NAI Diffusion V4.5 五層系統範本（NSFW 全保留、具體範例已中性化成佔位防副模型照抄）
                extractPromptTags: `每張插圖的 "prompt" 用 NAI Diffusion V4.5 的 Danbooru 標籤格式（英文、逗號分隔、單行）。嚴格照五層順序：

第0層 人數＋防混淆鎖：prompt 最前面先放人數（1boy / 2boys / 1boy 1girl…）。2 人以上緊接一句英文短句，把各角色的關鍵特徵＋位置先鎖定，避免特徵互相污染。
第1層 外觀（防同臉，放 AND 區塊內）：每個焦點角色都要完整寫，禁止偷懶只詳寫第一個、第二個留空。每個角色區塊開頭固定 3 鎖 → [1] 年齡體型 (adult:1.5)/adult_male/young_adult　[2] 位置 left_side/right_side（NSFW 貼身時「不要」放位置 tag）　[3] 對比 膚色/髮色；接著完整描述、不可省略：氣質, 臉型, 體型, 眼型, 髮長, 髮型, 髮質, 瀏海, 特徵, 服裝, 表情。
第2層 動作/姿勢（放 AND 區塊內）。
第3層 互動（放 AND 區塊外）：貼身接觸用 same_height, bodies_intertwined 防身形縮小。
第4層 環境與鏡頭（放 AND 區塊外，鏡頭 tag「只能」放這層、絕不放進角色區塊）：場景, 時間, 光線, 鏡頭(from_side / bust_shot / medium_shot…)。

人群控制(3＋角色)：只挑 1~2 個焦點角色用 AND 區塊，其餘降級成 crowd, blurry_background, depth_of_field；絕不寫 3 個以上 AND 區塊。
鏡頭模式：平靜/SFW → standing/sitting, left_side/right_side, from_side, medium_shot/bust_shot；動作 → dynamic_pose, dynamic_angle, motion_blur；NSFW → nsfw 當第一個 tag，明確體位直接畫(missionary, mating_press, penetration…)，貼身零距離不放位置 tag。
🚫 表達「不接觸／有距離」鐵則（最常出包！）：畫圖 AI 看不懂否定句——寫 they do not touch / no contact 反而會讓它看到 touch 就把兩人畫在一起(黏一起、躺懷裡)。所以：①絕不用 do not touch / not touching / no contact 這類否定句。②要有距離就用肯定詞：standing apart, space between them, an arm's length apart, facing each other across a gap, at a distance, keeping distance。③遠距離互動(施法/遞物/指引)動詞用 pointing/channeling/directing/aiming … toward，禁用 envelops/touches/rests on/cups/cradles/leaning into 這種貼身詞(會被讀成親密)。④只有真的要親密/NSFW 才寫接觸詞(hug/embrace/in arms…)。

其它：多人時每角色標籤分開寫、A 的衣服別長到 B 身上；★角色長相(髮色/瞳色/體型)一律以下方【角色外觀錨點】為權威，照填、不要漏、不要亂編，錨點沒列到的才沿用已知設定；找不到適合入畫的畫面就回空、不硬湊。

格式範例（[方括號]是佔位，照正文實際內容填，不要照抄方括號裡的字）：
SFW 2 人對話：2boys, a [膚色] adult on the left talks to a [膚色] adult on the right, [young_adult, left_side, [膚色], [氣質], [臉型], [體型], [眼型], [髮型], [瀏海], [服裝], standing, talking, looking_at_another] AND [adult_male, right_side, [膚色], [氣質], [臉型], [體型], [眼型], [髮型], [瀏海], [服裝], leaning_against_wall, listening], casual_conversation, eye_contact, [場景], [時間], from_side, bust_shot
NSFW 零距離：(nsfw:1.2), 2boys of the same height, a [膚色] adult male on top penetrating a [膚色] adult male underneath, [(adult:1.5), [膚色], [氣質], [臉型], [體型], [眼型], [髮型], [瀏海], naked_upper_body, kneeling, on_top, inserting, [表情]] AND [(adult:1.5), [膚色], [氣質], [臉型], [體型], [眼型], [髮型], naked, lying_on_back, legs_up, under_another, inserted, [表情]], same_height, bodies_intertwined, mating_press, penetration, [場景], from_side, medium_shot`,
                // 💬 自然語言版（自訂接口 / ComfyUI Anima：自然語言比標籤更好）
                extractPromptNatural: `每張插圖的 "prompt" 用「自然語言英文句子」描述畫面（給 ComfyUI、自訂接口這類讀句子的生圖模型，自然語言比標籤更好）。
- 只照「最新這段正文」真的發生、畫得出來的畫面，不要推理後續劇情、不腦補角色心理或感情。
- 一句話交代：誰、在做什麼、在哪裡、光線氣氛、鏡頭遠近。
- ★角色外觀(髮色/眼色/體型/服裝)一律以下方【角色外觀錨點】為權威，照它寫、不要漏、不要自己編；錨點沒列到的角色才依劇情與已知設定。
- 多人場景：每個人各自的外觀(尤其髮色/眼色)都要寫清楚，別讓 A 的特徵混到 B 身上。
- 寫法像跟人口頭描述一張已經畫好的圖：先說畫面裡只有幾個人、在哪裡做什麼；每個人一句完整的話，說他在畫面哪裡（右邊、左下角、背景）、在看誰（寫出對象）；只有角色真的在看視角主人時才寫看鏡頭，不然模型會讓他轉頭看鏡頭；兩人互動時再加一句他們彼此在看；最後一句說從什麼角度拍、取景多大、光線。別寫成逗號串起來的詞。
- 手或腳伸向別人或別的東西時，跟它的主人寫在同一句，寫清楚落在什麼上，鏡頭要拍得下整段。
- 找不到適合入畫的畫面就回空、不硬湊。`
            },
            comfyuiDirect: {
                url: 'http://127.0.0.1:8188', modelType: 'checkpoint', model: '', vae: '', sampler: 'euler', scheduler: 'normal',
                steps: 28, cfg: 6.5, width: 1024, height: 1024, seed: -1, clipSkip: 0,
                basePrompt: '', negPrompt: '', loras: [], presets: [], previewPrompt: '1 person, upper body portrait, looking at viewer, simple background',
                sceneHires: true, sceneHiresScale: 1.5, sceneFaceDetailer: true,
                workflowMode: 'auto', customWorkflow: '',
                fluxClipL: 'clip_l.safetensors', fluxT5: 't5xxl_fp8_e4m3fn.safetensors', fluxAe: 'ae.safetensors', guidance: 3.5,
                animaClip: 'qwen_3_06b_base.safetensors', animaVae: 'qwen_image_vae.safetensors'
            }
        };
        // 場景插圖：每接口獨立的副模型插圖指令（預設＝沿用舊的 標籤/自然語言 範本，NAI 用標籤、其餘用自然語言）
        config.sceneGen.extractPromptNovelai      = config.sceneGen.extractPromptTags;
        config.sceneGen.extractPromptComfy        = config.sceneGen.extractPromptNatural;
        config.sceneGen.extractPromptTavern       = config.sceneGen.extractPromptNatural;
        config.sceneGen.extractPromptCustom       = config.sceneGen.extractPromptNatural;   // 自訂接口：OpenAI 那種格式吃自然語言
        if (saved) {
            try {
                const savedConfig = JSON.parse(saved);
                config = {
                    ...config,
                    ...savedConfig,
                    // 頭像/插圖拆桶遷移：沒存過新桶 → 繼承舊「活物桶」serviceLiving，現狀不變
                    serviceChar:  savedConfig.serviceChar  || savedConfig.serviceLiving || savedConfig.service || config.service,
                    serviceScene: savedConfig.serviceScene || savedConfig.serviceLiving || savedConfig.service || config.service,
                    serviceMap:   savedConfig.serviceMap   || savedConfig.serviceInanimate || savedConfig.service || config.service,
                    novelai: {
                        ...config.novelai,
                        ...(savedConfig.novelai || {})
                    },
                    customApi: {
                        ...config.customApi,
                        ...(savedConfig.customApi || {})
                    },
                    sceneGen: (function () {
                        const _sg = { ...config.sceneGen, ...(savedConfig.sceneGen || {}) };
                        const _saved = savedConfig.sceneGen || {};
                        // 舊存檔只有單一 extractPrompt（多半是使用者調過的 ComfyUI/自然語言版）→ 沒有新「自然語言版」欄位時遷進去不丟
                        if (_saved.extractPrompt && !_saved.extractPromptNatural) _sg.extractPromptNatural = _saved.extractPrompt;
                        // 拆每接口獨立欄：舊存檔沒存過新欄 → 從舊「標籤/自然語言」灌種（NAI←標籤，其餘←自然語言），各自獨立、不再共用
                        const _oldTags = (_saved.extractPromptTags || _sg.extractPromptTags || '').trim();
                        const _oldNat  = (_saved.extractPromptNatural || _sg.extractPromptNatural || _saved.extractPrompt || '').trim();
                        if (_saved.extractPromptNovelai      === undefined && _oldTags) _sg.extractPromptNovelai      = _oldTags;
                        if (_saved.extractPromptComfy        === undefined && _oldNat)  _sg.extractPromptComfy        = _oldNat;
                        if (_saved.extractPromptTavern       === undefined && _oldNat)  _sg.extractPromptTavern       = _oldNat;
                        if (_saved.extractPromptCustom       === undefined && _oldNat)  _sg.extractPromptCustom       = _oldNat;
                        return _sg;
                    })(),
                    comfyuiDirect: {
                        ...config.comfyuiDirect,
                        ...(savedConfig.comfyuiDirect || {}),
                        loras: (savedConfig.comfyuiDirect && Array.isArray(savedConfig.comfyuiDirect.loras)) ? savedConfig.comfyuiDirect.loras : config.comfyuiDirect.loras,
                        presets: (savedConfig.comfyuiDirect && Array.isArray(savedConfig.comfyuiDirect.presets)) ? savedConfig.comfyuiDirect.presets : config.comfyuiDirect.presets
                    },
                    pixabayKey:    savedConfig.pixabayKey || '',
                    fallbackForce: savedConfig.fallbackForce === true,
                    avatarSize:    savedConfig.avatarSize || '',
                    bgSize:        savedConfig.bgSize || '1024x768'
                };
            } catch(e) {}
        }
        // 🗑 2026-11-17 拿掉 Pollinations：舊存檔裡選它的桶變「還沒接」，它那份設定（含插圖指令那一份）不再帶著
        ['service', 'serviceInanimate', 'serviceLiving', 'serviceChar', 'serviceScene', 'serviceMap'].forEach(k => {
            if (config[k] === 'pollinations') config[k] = '';
        });
        delete config.pollinations;
        if (config.sceneGen) delete config.sceneGen.extractPromptPollinations;
        return config;
    }
    
    // --- 讀取 Minimax 語音設置 ---
    //   語音模組在就直接問它（預設值只有它那一份）；以前這裡自己寫一份預設是 speech-01-turbo，
    //   沒存過設定的人一打開設置頁按保存，就從實際在用的 02 被降成 01
    function loadMinimaxConfig() {
        const MM = (window.parent || window).OS_MINIMAX;
        if (MM && typeof MM.getConfig === 'function') return MM.getConfig();
        let saved = localStorage.getItem(MINIMAX_STORAGE_KEY);
        let config = {
            enabled: false,
            groupId: '',
            apiKey: '',
            provider: 'cn',
            speechModel: 'speech-02-turbo',   // 跟 os_minimax.js 的 DEFAULT_CONFIG 一樣
            defaultSpeed: 1.0,
            defaultLanguageBoost: '',
            voiceProfiles: []
        };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        return config;
    }

    // 回 true＝四份都存進去了。任一份存不進去（空間滿了）回 false，呼叫的地方就不報「已保存」；
    // 寫不進去不丟例外，所以下面同步給生圖模組那段照樣做（生圖模組手上那份跟畫面一致，重整後才會回到存著的舊值）
    function saveConfig(llmData, secLlmData, imgData, minimaxData) {
        let ok = _lsSet(LLM_STORAGE_KEY, JSON.stringify(llmData), '主模型設定');
        ok = _lsSet(SEC_LLM_STORAGE_KEY, JSON.stringify(secLlmData), '副模型設定') && ok;
        ok = _lsSet(IMG_STORAGE_KEY, JSON.stringify(imgData), '圖片設定') && ok;

        if (minimaxData) {
            // 跟語音模組存的是同一把鑰匙：它在就交給它存（以前這裡先寫一次、它又寫一次），不在才自己寫
            const win2 = window.parent || window;
            if (win2.OS_MINIMAX && typeof win2.OS_MINIMAX.saveConfig === 'function') ok = win2.OS_MINIMAX.saveConfig(minimaxData) && ok;
            else ok = _lsSet(MINIMAX_STORAGE_KEY, JSON.stringify(minimaxData), '語音設定') && ok;
        }

        const win = window.parent || window;
        if (win.OS_IMAGE_MANAGER) {
            // 三桶 + legacy mirror（serviceLiving / service = 頭像桶 serviceChar）。同步 ON 時 serviceInanimate 已＝serviceChar
            win.OS_IMAGE_MANAGER.config.serviceInanimate = imgData.serviceInanimate || imgData.service;
            win.OS_IMAGE_MANAGER.config.serviceChar  = imgData.serviceChar  || imgData.serviceLiving || imgData.service;
            win.OS_IMAGE_MANAGER.config.serviceScene = imgData.serviceScene || imgData.serviceLiving || imgData.service;
            win.OS_IMAGE_MANAGER.config.serviceMap   = imgData.serviceMap   || imgData.serviceInanimate || imgData.service;
            win.OS_IMAGE_MANAGER.config.serviceLiving = imgData.serviceLiving || imgData.serviceChar || imgData.service;
            win.OS_IMAGE_MANAGER.config.service = imgData.serviceLiving || imgData.serviceChar || imgData.service;
            if (typeof imgData.imgSourceSynced === 'boolean') win.OS_IMAGE_MANAGER.config.imgSourceSynced = imgData.imgSourceSynced;
            if (imgData.novelai) {
                win.OS_IMAGE_MANAGER.config.novelai = {
                    ...win.OS_IMAGE_MANAGER.config.novelai,
                    ...imgData.novelai
                };
            }
            if (imgData.customApi) {
                win.OS_IMAGE_MANAGER.config.customApi = {
                    ...win.OS_IMAGE_MANAGER.config.customApi,
                    ...imgData.customApi
                };
            }
            if (imgData.comfyuiDirect) {
                win.OS_IMAGE_MANAGER.config.comfyuiDirect = {
                    ...win.OS_IMAGE_MANAGER.config.comfyuiDirect,
                    ...imgData.comfyuiDirect
                };
            }
            console.log('[OS設置] ✅ 圖片管理器配置已更新, 死物桶:', win.OS_IMAGE_MANAGER.config.serviceInanimate, '頭像桶:', win.OS_IMAGE_MANAGER.config.serviceChar, '插圖桶:', win.OS_IMAGE_MANAGER.config.serviceScene);
        }
        return ok;
    }

    // 🏷 角色外觀登記表（每個角色的頭像生成詞）11-16 搬到角色中心「裝扮」頁最下面的「他的長相」：core/void/lobby_dress.js 的 _wireDressLook。

    // 合併而不是整份蓋掉:claude-codex-room 擴展會先在 OS_SETTINGS 掛
    // getClaudeRoomConfig 那組 shim,本檔載入比它晚時整份指派會把人家抹掉
    // (症狀:房間底部欄按了沒反應、設置分頁顯示「設定模組未載入」)。
    window.OS_SETTINGS = Object.assign(window.OS_SETTINGS || {}, {
        getConfig: loadLlmConfig,
        getSecondaryConfig: loadSecLlmConfig,
        // 🔌 哪件事走哪條（通道清單在設置 → API → 分流）
        getConfigFor: getConfigForTask,
        getRouteOverride: getRouteOverride,
        getChannels: loadChannels,
        saveChannels: saveChannels,
        getRoutes: loadRoutes,
        saveRoutes: saveRoutes,
        routeLabel: routeLabel,
        LLM_TASKS: LLM_TASKS,
        getVisionMode: getVisionMode,
        setVisionMode: setVisionMode,
        getImageConfig: loadImageConfig,
        getMinimaxConfig: loadMinimaxConfig,
        saveConfig: saveConfig
    });

    const getSTContext = () => { try { return window.parent.SillyTavern ? window.parent.SillyTavern.getContext() : null; } catch (e) { return null; } };

    // ── 酒館擴展設置（「一般」分頁最上面那兩格）─────────────────────────────
    //   這兩格原本住在酒館 Extensions 抽屜（settings.html），那是酒館的地盤、跟她其他設定分兩處；
    //   搬進來之後那個抽屜整個撤掉了（啟用開關由酒館助手的腳本清單管）。存的還是同一個
    //   extension_settings['多功能面板系統']，讀的人（index.js 的掛載、html_extractor、
    //   story_extractor、ui_utilities 的收合）一行都沒動。
    //   ⚠️ 手機殼可能跑在 iframe 裡：extension_settings / toastr / .mes 全都在主頁面，一律走 _tvWin()。
    const _tvWin = () => { try { return (window.parent && window.parent !== window && window.parent.SillyTavern) ? window.parent : window; } catch (e) { return window; } };
    const TAVERN_EXT_KEY = '多功能面板系統';

    function loadTavernExtSettings() {
        const W = _tvWin();
        if (typeof W.extension_settings === 'undefined') W.extension_settings = {};
        let st = W.extension_settings[TAVERN_EXT_KEY];
        if (!st) {
            try {
                const saved = W.localStorage.getItem('extension_settings');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && parsed[TAVERN_EXT_KEY]) { st = parsed[TAVERN_EXT_KEY]; W.extension_settings[TAVERN_EXT_KEY] = st; }
                }
            } catch (e) {}
        }
        return st || {};
    }

    function saveTavernExtSettings(patch) {
        const W = _tvWin();
        if (typeof W.extension_settings === 'undefined') W.extension_settings = {};
        if (!W.extension_settings[TAVERN_EXT_KEY]) W.extension_settings[TAVERN_EXT_KEY] = {};
        Object.assign(W.extension_settings[TAVERN_EXT_KEY], patch);
        if (typeof W.saveSettingsDebounced === 'function') W.saveSettingsDebounced();
        else if (typeof W.saveSettings === 'function') W.saveSettings();
        else _lsSet('extension_settings', JSON.stringify(W.extension_settings), '酒館擴展設定');
    }

    // 設置頁切分頁、角色立繪 UI 這幾支掛在 window 上的小工具：只建一次、只碰 document，不用 launchApp 的任何東西。
    //   🚨 一定要定義在 launchApp 外面：在 launchApp 裡面建的函式會連帶抓住那一次打開的整個作用域（所有欄位、整份設置畫面），
    //   掛在 window 上就永遠放不掉（10-20 手機記憶體巡查：快照追到 window._switchAvatarSub 抓著第一次開的那份設置畫面）
    function _installSettingsHelpers() {
        // 畫廊子 tab 切換 helper（含 avatar/bg 列表 lazy load）
        if (!window._switchOsGalTab) {
            window._switchOsGalTab = function(el, tabId) {
                el.parentElement.querySelectorAll('[data-galtab]').forEach(t => t.classList.remove('active'));
                el.classList.add('active');
                document.querySelectorAll('.img-subtab-view').forEach(v => v.style.display = 'none');
                const target = document.getElementById('view-img-' + tabId);
                if (target) target.style.display = 'block';
                if (tabId === 'avatar' && window.VN_PLAYER?.loadAvatarManager) {
                    window.VN_PLAYER.loadAvatarManager('vncfg-avatar-mgr-list');
                } else if (tabId === 'bg' && window.VN_PLAYER?.loadBgManager) {
                    window.VN_PLAYER.loadBgManager('vncfg-bg-mgr-list');
                } else if (tabId === 'scene' && window.VN_PLAYER?.loadSceneManager) {
                    window.VN_PLAYER.loadSceneManager('vncfg-scene-mgr-list');
                }
            };
        }

        // API tab 內層子 tab：主模型 / 副模型 切換（就像語音面板的子 tab）
        if (!window._switchApiTab) {
            window._switchApiTab = function(which) {
                document.querySelectorAll('.api-subview').forEach(v => { v.style.display = (v.id === 'view-' + which) ? '' : 'none'; });
                document.querySelectorAll('.api-subtab').forEach(t => t.classList.toggle('active', t.dataset.apitab === which));
            };
        }

        // ───── 頭像 tab 內層子 tab：頭像快取 / 角色立繪 ─────
        if (!window._switchAvatarSub) {
            window._switchAvatarSub = function(el, subId) {
                document.querySelectorAll('.av-sub').forEach(t => {
                    t.classList.remove('active');
                    t.style.color = 'rgba(26,28,40,0.40)';
                    t.style.borderColor = '#444';
                    t.style.background = 'transparent';
                });
                el.classList.add('active');
                el.style.color = '#1A1C28';
                el.style.borderColor = 'rgba(26,28,40,0.25)';
                el.style.background = 'rgba(26,28,40,0.06)';
                document.querySelectorAll('.avatar-sub-view').forEach(v => v.style.display = 'none');
                const target = document.getElementById('avatar-sub-' + subId);
                if (target) target.style.display = 'block';
                if (subId === 'sprite' && window._initSpriteUI) window._initSpriteUI();
            };
        }

        // ───── 角色立繪 UI：lazy 初始化 ─────
        if (!window._initSpriteUI) {
            const DEF_PREFIX = 'straight posturing, solo, (facing viewer:1.2), (cowboy shot:1.2), front view, clothes and pants, standing, ';
            const DEF_SUFFIX = 'simple bright background, straight view, no shading';
            const LS_PFX = 'os_sprite_tpl_prefix';
            const LS_SFX = 'os_sprite_tpl_suffix';
            const LS_NEG = 'os_sprite_tpl_neg';   // 立繪負詞（使用者填，接在各接口既有負詞後面；空＝現狀）
            const LS_RATIO = 'os_sprite_upscale_ratio';
            const LS_HIRES = 'os_sprite_hires';
            const state = { inited: false, bgRemover: null, blob: null, blobUrl: null, isRemoved: false };

            const setStatus = (msg, isErr) => {
                const el = document.getElementById('sprite-status');
                if (!el) return;
                el.textContent = msg || '';
                el.style.color = isErr ? '#fc8181' : 'rgba(26,28,40,0.40)';
            };
            const enableBtn = (id, on) => {
                const b = document.getElementById(id);
                if (!b) return;
                b.style.opacity = on ? '1' : '0.5';
                b.style.pointerEvents = on ? 'auto' : 'none';
            };

            // 清洗頭像 prompt：剝掉跟立繪衝突的構圖 / 背景 / 視角 tag
            // 原 prompt 可能含 "bust shot, soft background, looking at viewer"，會跟模板的 upper body / dark background 打架
            function stripPromptForSprite(p) {
                // 規則只有一份在 VN_Image._stripForSprite（vn_config.js，開機就載）；以前這裡自己抄一套，背景只剝一個字的毛病三份一起錯
                const VI = (window.parent || window).VN_Image || window.VN_Image;
                return (VI && VI._stripForSprite) ? VI._stripForSprite(p) : String(p || '').trim();
            }

            async function spriteGenerate(name, finalPrompt) {
                // finalPrompt 來自卡片內 textarea，預填清洗版、可由用戶微調，這裡不再清洗
                const win2 = window.parent || window;
                if (!name) { setStatus('請從上方列表點一個角色', true); return; }
                if (!finalPrompt) { setStatus('「' + name + '」的 prompt 為空', true); return; }
                if (!win2.OS_IMAGE_MANAGER) { setStatus('OS_IMAGE_MANAGER 未就緒', true); return; }

                state.selectedName = name;
                state.selectedPrompt = finalPrompt;  // 存用戶最終確認的版本（供 spriteSave）
                document.getElementById('sprite-selected-info').innerHTML =
                    '<i class="fa-solid fa-bullseye"></i> 當前：<b style="color:var(--os-ink);">' + _capiEsc(name) + '</b>';

                // 🚨 三段之間一定要逗號（同 VN_Image.getSprite / autoGenSprite）：直接相接會把角色描述的最後一個 tag
                //    跟後綴第一個字黏成一團（white dress + simple → "white dresssimple"），一次毀掉兩個 tag
                const _JT = win2.VN_Image && win2.VN_Image._joinTags;
                if (!_JT) { setStatus('生圖模組（vn_config.js）尚未載入，請先進一次 VN 再回來', true); return; }
                // 跟劇情裡自動生立繪（VN_Image.getSprite）同一條：前綴沒寫 pants 時，照外觀補一句下身，兩邊構圖才一樣
                const _pfx = document.getElementById('sprite-tpl-prefix').value;
                const _lw = (!/pants/i.test(_pfx) && win2.VN_Image && typeof win2.VN_Image._lowerWear === 'function') ? win2.VN_Image._lowerWear(finalPrompt) : '';
                let fullPrompt = _JT(_pfx, finalPrompt, _lw, document.getElementById('sprite-tpl-suffix').value);
                setStatus('為「' + name + '」生立繪中（5–30 秒）...');
                document.getElementById('sprite-preview').innerHTML = '<span style="color:var(--os-ink-soft);font-size:11px;">生成中...</span>';
                enableBtn('sprite-removebg-btn', false);
                enableBtn('sprite-removebg-canvas-btn', false);
                enableBtn('sprite-save-btn', false);

                try {
                    // 立繪基礎 512×896 (約 4:7 直立，full body 站姿放得下腿)、依「精緻度倍率」放大、跳過 cache。
                    // NAI 的提示詞是逗號標籤，純靠通用模板會很裸/畫質差 →
                    // 真的會走 NAI 時就「不 raw」，讓它套用「圖片設置」裡設好的 NAI 底詞/負詞（跟頭像同一套畫風）；
                    // 其他接口維持 raw（純模板，行為不變）。
                    const _imCfg = win2.OS_IMAGE_MANAGER.config;
                    // 立繪走圖片設置「畫風」頁「立繪」那一列（以前看全域 service，那格早就不是立繪用的了）
                    const _spSvc = (typeof win2.OS_IMAGE_MANAGER.serviceForUse === 'function') ? win2.OS_IMAGE_MANAGER.serviceForUse('sprite') : (_imCfg && _imCfg.service);
                    const _useNAI = !!(_spSvc === 'novelai' && _imCfg && _imCfg.novelai && _imCfg.novelai.token);
                    const _isComfy = (_spSvc === 'comfyui_direct');
                    // 🎨 raw 是「原樣送、不附底詞」。自訂接口那格底詞就是她填的畫風，立繪不附＝整張沒有風格
                    //    → 判斷收在 VN_Image._spriteRaw 一份，三條立繪路徑共用（拿不到就退回原本的寫法）。
                    const _svc = _spSvc;
                    const _spriteRawFor = function (sv) {
                        const VI = win2.VN_Image || window.VN_Image;   // 這裡沒有 win（以前寫 win.VN_Image，win2 上沒有時會直接拋錯）
                        return (VI && typeof VI._spriteRaw === 'function') ? VI._spriteRaw(sv) : !_useNAI;
                    };
                    // 立繪 base 比例（可調，「立繪比例」下拉，預設 512×896；鎧甲/壯角色選寬一點）
                    let _bw = 512, _bh = 896;
                    try { const _bp = String(localStorage.getItem('os_sprite_size') || '512x896').split('x').map(Number); if (_bp[0] && _bp[1]) { _bw = _bp[0]; _bh = _bp[1]; } } catch(e) {}
                    // 🪽 帶翼角色加寬畫框（三條立繪路徑共用 OS_IMAGE_MANAGER.wideFrame）：判定看角色描述 finalPrompt，
                    //    不看套完模板的 fullPrompt（模板裡沒有翅膀詞）。加寬在倍率之前，倍率照樣往上乘。
                    try {
                        const _wf = win2.OS_IMAGE_MANAGER.wideFrame(_bw, _bh, finalPrompt);
                        if (_wf.extra) { _bw = _wf.width; _bh = _wf.height; fullPrompt += ', ' + _wf.extra; }
                    } catch(e) {}
                    // 精緻度倍率＋高清修復都是 ComfyUI 直連專屬；非 ComfyUI 不套倍率（base 比例就是最終尺寸）
                    const _ratioEl = document.getElementById('sprite-upscale-ratio');
                    const _ratio = _isComfy ? (parseFloat((_ratioEl && _ratioEl.value) || localStorage.getItem(LS_RATIO) || '1.5') || 1.5) : 1;
                    const _hiresEl = document.getElementById('sprite-hires');
                    const _hiresOn = _isComfy && _hiresEl && _hiresEl.checked && _ratio > 1;
                    // 立繪負詞（使用者在「負詞」框填）：接在各接口既有負詞後面(extraNegative,不取代)。空＝不送。
                    const _spriteNeg = (document.getElementById('sprite-tpl-neg')?.value || '').trim() || undefined;
                    let _opts;
                    if (_hiresOn) {
                        _opts = { force: true, width: _bw, height: _bh, raw: _spriteRawFor(_svc), extraNegative: _spriteNeg, comfyHires: { scale: _ratio, denoise: 0.45 } };
                        setStatus('為「' + name + '」生立繪中（高清修復，較久 15–60 秒）...');
                    } else {
                        const _sw = Math.round(_bw * _ratio / 8) * 8;
                        const _sh = Math.round(_bh * _ratio / 8) * 8;
                        _opts = { force: true, width: _sw, height: _sh, raw: _spriteRawFor(_svc), extraNegative: _spriteNeg };
                    }
                    _opts.use = 'sprite';
                    const url = await win2.OS_IMAGE_MANAGER.generate(fullPrompt, 'char', _opts);
                    if (!url) throw new Error('OS_IMAGE_MANAGER 回傳空 URL');
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('抓圖失敗 HTTP ' + res.status);
                    const blob = await res.blob();

                    if (state.blobUrl) { try { URL.revokeObjectURL(state.blobUrl); } catch(_){} }
                    state.blob = blob;
                    state.blobUrl = URL.createObjectURL(blob);
                    state.isRemoved = false;

                    document.getElementById('sprite-preview').innerHTML = '<img src="' + state.blobUrl + '" style="max-width:100%;max-height:300px;border-radius:4px;">';
                    setStatus('生成完成');
                    enableBtn('sprite-removebg-btn', true);
                    enableBtn('sprite-removebg-canvas-btn', true);
                    enableBtn('sprite-save-btn', true);
                } catch (e) {
                    console.error('[Sprite] 生成失敗:', e);
                    setStatus(e.message, true);
                    document.getElementById('sprite-preview').innerHTML = '<span style="color:#fc8181;font-size:11px;">生成失敗</span>';
                }
            }

            async function renderAvatarPicker() {
                const win2 = window.parent || window;
                const listEl = document.getElementById('sprite-picker-list');
                if (!listEl) return;
                if (!win2.VN_Cache) { listEl.innerHTML = '<span style="color:#fc8181;">VN_Cache 未就緒，請先進 VN 一次再回來</span>'; return; }
                try {
                    const VC = win2.VN_Cache;
                    const cur = VC.getCurrentWorld ? VC.getCurrentWorld() : '';
                    // 清單不讀圖；圖只撈「選中的這個世界」那幾張、一張一張放上去（整庫頭像一次進記憶體會 OOM）
                    const all = await VC.getAllMeta('avatar_cache');
                    const valid = all.filter(e => e.hasUrl);
                    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                    // 依世界分組（含「未分類」舊頭像）+ 下拉切換 → 舊頭像也挑得到、能繼續轉立繪
                    const groups = {};
                    valid.forEach(e => { const w = VC.worldOf ? VC.worldOf(e) : ''; (groups[w] = groups[w] || []).push(e); });
                    const wkeys = Object.keys(groups).sort((a, b) => { if (a === cur) return -1; if (b === cur) return 1; if (a === '') return 1; if (b === '') return -1; return a < b ? -1 : 1; });
                    if (!wkeys.includes(cur)) wkeys.unshift(cur);
                    if (state.pickerWorld == null || (groups[state.pickerWorld] === undefined && state.pickerWorld !== cur)) state.pickerWorld = cur;
                    const wlabel = w => !w ? '未分類（舊頭像）' : (w === cur ? '當前世界' : (w.length > 20 ? '…' + w.slice(-18) : w));
                    let html = '<select class="vng-sel" id="sprite-picker-world" style="margin-bottom:10px;">'
                        + wkeys.map(w => '<option value="' + esc(w) + '"' + (w === state.pickerWorld ? ' selected' : '') + '>' + esc(wlabel(w)) + ' (' + (groups[w] || []).length + ')</option>').join('')
                        + '</select>';
                    const pentries = groups[state.pickerWorld] || [];
                    if (!pentries.length) {
                        html += '<div style="color:var(--os-ink-soft);font-size:11px;padding:10px 0;">這個世界沒有頭像</div>';
                    } else {
                        html += '<div class="vng-grid">' + pentries.map(e => {
                            const bare = VC.bareKeyOf ? VC.bareKeyOf(e) : e.key;
                            return '<div class="vng-card vng-pick" data-key="' + encodeURIComponent(e.key) + '" data-name="' + esc(bare) + '" title="' + esc(bare) + '"><img alt=""><div class="vng-foot">' + esc(bare) + '</div></div>';
                        }).join('') + '</div>';
                    }
                    listEl.className = '';
                    listEl.innerHTML = html;
                    const wsel = document.getElementById('sprite-picker-world');
                    if (wsel) wsel.onchange = () => { state.pickerWorld = wsel.value; renderAvatarPicker(); };
                    listEl.querySelectorAll('.vng-pick').forEach(card => {
                        card.onclick = () => {
                            listEl.querySelectorAll('.vng-pick').forEach(c => c.classList.remove('is-sel'));
                            card.classList.add('is-sel');
                            const k = decodeURIComponent(card.getAttribute('data-key'));
                            const name = card.getAttribute('data-name');
                            const entry = valid.find(x => x.key === k);
                            state.selectedName = name;
                            const cleaned = stripPromptForSprite(entry ? (entry.prompt || '') : '');
                            const pEl = document.getElementById('sprite-sel-prompt'); if (pEl) pEl.value = cleaned;
                            const bar = document.getElementById('sprite-sel-bar'); if (bar) bar.style.display = 'flex';
                            const info = document.getElementById('sprite-selected-info'); if (info) info.textContent = '已選角色：' + name;
                        };
                    });
                    for (const card of listEl.querySelectorAll('.vng-pick')) {
                        const v = await VC.getRaw('avatar_cache', decodeURIComponent(card.getAttribute('data-key')));
                        if (!card.isConnected) break;   // 這段時間她換了世界＝整塊重畫了
                        if (v && v.url && !String(v.url).startsWith('blob:')) card.querySelector('img').src = v.url; else card.remove();
                    }
                } catch (e) {
                    listEl.innerHTML = '<span style="color:#fc8181;">列表載入失敗: ' + _capiEsc(e && e.message) + '</span>';
                }
            }

            async function spriteRemoveBg() {
                if (!state.blob) { setStatus('沒圖可去背', true); return; }
                if (state.isRemoved) { setStatus('已經去過背了', true); return; }
                enableBtn('sprite-removebg-btn', false);
                setStatus('載入 AI 模型（第一次約 85MB，之後快）...');
                try {
                    // 走劇情立繪那支共用的（有顯卡用顯卡、跟其他去背排隊；見 vn_core.js _stripSpriteBgAI）
                    const VC = (window.parent || window).VN_Core || window.VN_Core;
                    if (!VC || !VC._stripSpriteBgAI) throw new Error('去背工具還沒載入，稍等再按一次');
                    setStatus('AI 去背中...');
                    const removed = await VC._stripSpriteBgAI(state.blob, {
                        progress: (k, c, t) => { if (t > 0) setStatus(k + ': ' + Math.round(c/t*100) + '%'); }
                    });
                    if (!removed) throw new Error('去背沒成功');
                    _applyRemovedBlob(removed);
                    setStatus('AI 去背完成');
                } catch (e) {
                    console.error('[Sprite] AI 去背失敗:', e);
                    setStatus('AI 去背失敗: ' + e.message, true);
                    enableBtn('sprite-removebg-btn', true);
                    enableBtn('sprite-removebg-canvas-btn', true);
                }
            }

            // 去背成功後共用：換 state.blob + 預覽（透明用棋盤格底襯托）
            const REMOVED_PREVIEW_BG = 'background:linear-gradient(45deg,#2a2018 25%,transparent 25%),linear-gradient(-45deg,#2a2018 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2018 75%),linear-gradient(-45deg,transparent 75%,#2a2018 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;';
            function _applyRemovedBlob(removed) {
                if (state.blobUrl) { try { URL.revokeObjectURL(state.blobUrl); } catch(_){} }
                state.blob = removed;
                state.blobUrl = URL.createObjectURL(removed);
                state.isRemoved = true;
                document.getElementById('sprite-preview').innerHTML =
                    '<img src="' + state.blobUrl + '" style="max-width:100%;max-height:300px;border-radius:4px;' + REMOVED_PREVIEW_BG + '">';
                enableBtn('sprite-save-btn', true);
            }

            // ✂️ 純色去背（canvas）：抓四角背景色 → 從邊緣 flood-fill 把「接近背景色且與邊緣連通」的像素設透明。
            //   只去除邊緣連通的背景 → 角色內部不會被打洞；二值 alpha → 不會像 AI matting 把角色弄半透明。
            //   專治純色背景立繪（尤其 NAI 圖被 AI 模型過度透明化的情況）。不下載模型、瞬間完成。
            async function spriteRemoveBgCanvas() {
                if (!state.blob) { setStatus('沒圖可去背', true); return; }
                if (state.isRemoved) { setStatus('已經去過背了（要換方式請重新生成）', true); return; }
                enableBtn('sprite-removebg-btn', false);
                enableBtn('sprite-removebg-canvas-btn', false);
                setStatus('純色去背中...');
                try {
                    const bmp = await createImageBitmap(state.blob);
                    const W = bmp.width, H = bmp.height;
                    const cv = document.createElement('canvas');
                    cv.width = W; cv.height = H;
                    const ctx = cv.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(bmp, 0, 0);
                    if (bmp.close) bmp.close();
                    const imgData = ctx.getImageData(0, 0, W, H);
                    const d = imgData.data;

                    // 背景色：四角各取 ~6×6 平均（立繪是純色背景＋角色置中，角落必為背景）
                    const sampleCorner = (x0, y0) => {
                        let r = 0, g = 0, b = 0, n = 0;
                        for (let y = y0; y < Math.min(y0 + 6, H); y++)
                            for (let x = x0; x < Math.min(x0 + 6, W); x++) {
                                const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
                            }
                        return n ? [r / n, g / n, b / n] : [0, 0, 0];
                    };
                    const cs = [sampleCorner(0, 0), sampleCorner(Math.max(0, W - 6), 0),
                                sampleCorner(0, Math.max(0, H - 6)), sampleCorner(Math.max(0, W - 6), Math.max(0, H - 6))];
                    const bg = [0, 1, 2].map(k => cs.reduce((s, c) => s + c[k], 0) / cs.length);

                    // 去背強度滑桿 → 容差（顏色距離平方）。strength 0..100 → tol 20..110
                    const strEl = document.getElementById('sprite-bg-strength');
                    const strength = strEl ? parseInt(strEl.value, 10) : 50;
                    const tol = 20 + (isNaN(strength) ? 50 : strength) * 0.9;
                    const tol2 = tol * tol * 3;
                    const isBg = (p) => {
                        const i = p * 4, dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
                        return (dr * dr + dg * dg + db * db) <= tol2;
                    };

                    // 從四條邊入種子，flood-fill 連通的背景像素
                    const visited = new Uint8Array(W * H);
                    const stack = [];
                    for (let x = 0; x < W; x++) { stack.push(x); stack.push((H - 1) * W + x); }
                    for (let y = 0; y < H; y++) { stack.push(y * W); stack.push(y * W + W - 1); }
                    while (stack.length) {
                        const p = stack.pop();
                        if (visited[p]) continue;
                        visited[p] = 1;
                        if (!isBg(p)) continue;
                        d[p * 4 + 3] = 0; // 透明
                        const x = p % W, y = (p / W) | 0;
                        if (x > 0) stack.push(p - 1);
                        if (x < W - 1) stack.push(p + 1);
                        if (y > 0) stack.push(p - W);
                        if (y < H - 1) stack.push(p + W);
                    }
                    ctx.putImageData(imgData, 0, 0);
                    const removed = await new Promise(res => cv.toBlob(res, 'image/png'));
                    if (!removed) throw new Error('canvas 轉檔失敗');
                    _applyRemovedBlob(removed);
                    setStatus('純色去背完成');
                } catch (e) {
                    console.error('[Sprite] 純色去背失敗:', e);
                    setStatus('純色去背失敗: ' + e.message, true);
                    enableBtn('sprite-removebg-btn', true);
                    enableBtn('sprite-removebg-canvas-btn', true);
                }
            }

            async function spriteSave() {
                const win2 = window.parent || window;
                const name = state.selectedName;
                if (!name) { setStatus('沒有選中的角色', true); return; }
                if (!state.blob) { setStatus('沒圖可存', true); return; }
                if (!win2.VN_Cache) { setStatus('VN_Cache 未就緒，請先進 VN 一次再回來', true); return; }
                setStatus('儲存中...');
                try {
                    const dataUrl = await new Promise((res, rej) => {
                        const r = new FileReader();
                        r.onload = () => res(r.result);
                        r.onerror = rej;
                        r.readAsDataURL(state.blob);
                    });
                    const prefix = document.getElementById('sprite-tpl-prefix').value;
                    const suffix = document.getElementById('sprite-tpl-suffix').value;
                    await win2.VN_Cache.set('sprite_cache', name, {
                        url: dataUrl,
                        // 接縫補逗號：前綴自帶結尾逗號、後綴沒有 → 直接相加會把描述最後一個 tag
                        //   跟後綴第一個字黏成一團（white dress + simple → "white dresssimple"）。
                        prompt: [prefix, state.selectedPrompt || '', suffix]
                            .map(x => String(x || '').trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', '),
                        isRemoved: state.isRemoved,
                        createdAt: Date.now()
                    });
                    setStatus('已存「' + name + '」立繪');
                    refreshList();
                } catch (e) {
                    console.error('[Sprite] 儲存失敗:', e);
                    setStatus('儲存失敗: ' + e.message, true);
                }
            }

            async function refreshList() {
                const win2 = window.parent || window;
                const listEl = document.getElementById('sprite-list');
                if (!listEl) return;
                if (!win2.VN_Cache) { listEl.innerHTML = '<span style="color:#fc8181;">VN_Cache 未就緒，請先進 VN 一次再回來</span>'; return; }
                // 🌍 改用畫廊網格（世界感知、圖片為主）；VN_PLAYER 未就緒時退回極簡清單
                if (win2.VN_PLAYER && win2.VN_PLAYER.loadSpriteManager) { win2.VN_PLAYER.loadSpriteManager('sprite-list'); return; }
                try {
                    const all = await win2.VN_Cache.getAllMeta('sprite_cache', { partial: true });   // 只列名字，不讀圖
                    listEl.innerHTML = all.length ? all.map(e => '<div style="color:var(--os-ink-soft);font-size:11px;padding:2px 0;">' + _capiEsc(e.key) + '</div>').join('') : '<span style="color:var(--os-ink-soft);">尚無已存立繪</span>';
                } catch (e) { listEl.innerHTML = '<span style="color:#fc8181;">列表載入失敗</span>'; }
            }

            // 每次切到 sprite tab 都跑一次：DOM 是新的時要重新綁事件
            // 用 onclick/onchange 覆寫，不用 addEventListener（避免重複疊加），安全
            window._initSpriteUI = function() {
                const prefixEl = document.getElementById('sprite-tpl-prefix');
                const suffixEl = document.getElementById('sprite-tpl-suffix');
                const negEl = document.getElementById('sprite-tpl-neg');
                if (!prefixEl || !suffixEl) return;
                // 只有「沒存過」才顯示預設；她清空存起來的＝不要前綴，劇情裡自動生立繪（VN_Image._spriteTpl）也是這樣認。
                //   以前這裡用 ||，清空後框裡又冒出預設，這邊生的帶前綴、劇情裡生的不帶，同一個人兩種構圖
                prefixEl.value = localStorage.getItem(LS_PFX) ?? DEF_PREFIX;
                suffixEl.value = localStorage.getItem(LS_SFX) ?? DEF_SUFFIX;
                prefixEl.onchange = () => _lsSet(LS_PFX, prefixEl.value, '立繪前綴');
                suffixEl.onchange = () => _lsSet(LS_SFX, suffixEl.value, '立繪後綴');
                if (negEl) {
                    negEl.value = localStorage.getItem(LS_NEG) || '';   // 空＝現狀，使用者自己填
                    negEl.onchange = () => _lsSet(LS_NEG, negEl.value, '立繪負詞');
                }
                const sizeEl = document.getElementById('sprite-base-size');
                if (sizeEl) {
                    sizeEl.value = localStorage.getItem('os_sprite_size') || '512x896';
                    sizeEl.onchange = () => _lsSet('os_sprite_size', sizeEl.value, '立繪比例');
                }
                const ratioEl = document.getElementById('sprite-upscale-ratio');
                if (ratioEl) {
                    ratioEl.value = localStorage.getItem(LS_RATIO) || '1.5';
                    ratioEl.onchange = () => _lsSet(LS_RATIO, ratioEl.value, '立繪精緻度');
                }
                // 高清修復：ComfyUI 直連專屬，依當前來源顯示/隱藏
                const _win2 = window.parent || window;
                // 立繪是 char 型 → 走活物桶
                const _svc = (_win2.OS_IMAGE_MANAGER && typeof _win2.OS_IMAGE_MANAGER.serviceFor === 'function')
                    ? ((typeof _win2.OS_IMAGE_MANAGER.serviceForUse === 'function') ? _win2.OS_IMAGE_MANAGER.serviceForUse('sprite') : _win2.OS_IMAGE_MANAGER.serviceFor('char'))
                    : ((_win2.OS_IMAGE_MANAGER && _win2.OS_IMAGE_MANAGER.config && _win2.OS_IMAGE_MANAGER.config.service) || '');
                const hiresRow = document.getElementById('sprite-hires-row');
                const hiresEl = document.getElementById('sprite-hires');
                if (hiresRow) hiresRow.style.display = (_svc === 'comfyui_direct') ? 'inline-flex' : 'none';
                if (ratioEl) ratioEl.style.display = (_svc === 'comfyui_direct') ? '' : 'none';   // 精緻度倍率也 ComfyUI 專屬：非 ComfyUI 藏起來、固定小圖 512×896
                if (hiresEl) {
                    hiresEl.checked = localStorage.getItem(LS_HIRES) === '1';
                    hiresEl.onchange = () => _lsSet(LS_HIRES, hiresEl.checked ? '1' : '0', '立繪高清修復');
                }
                document.getElementById('sprite-tpl-reset').onclick = () => {
                    prefixEl.value = DEF_PREFIX;
                    suffixEl.value = DEF_SUFFIX;
                    if (negEl) negEl.value = '';
                    localStorage.removeItem(LS_PFX);
                    localStorage.removeItem(LS_SFX);
                    localStorage.removeItem(LS_NEG);
                };
                document.getElementById('sprite-removebg-btn').onclick = spriteRemoveBg;
                document.getElementById('sprite-removebg-canvas-btn').onclick = spriteRemoveBgCanvas;
                document.getElementById('sprite-save-btn').onclick = spriteSave;
                const _genBtn = document.getElementById('sprite-gen-btn');
                if (_genBtn) _genBtn.onclick = () => {
                    if (!state.selectedName) { setStatus('請先點上方一個角色', true); return; }
                    const p = (document.getElementById('sprite-sel-prompt').value || '').trim();
                    spriteGenerate(state.selectedName, p);
                };
                renderAvatarPicker();
                refreshList();
            };
        }
    }

    function launchApp(container, mode) {
        const llmConfig = loadLlmConfig();
        const secLlmConfig = loadSecLlmConfig();
        const imgConfig = loadImageConfig();
        const minimaxConfig = loadMinimaxConfig();
        const vnD = (window.VN_SETTINGS_PANEL?.load) ? window.VN_SETTINGS_PANEL.load() : {};
        // 🎯 頭像那桶現在接的型號名（自訂接口那條才有）。節點只是預設組，選了之後值就在這幾格裡。
        const _charModelName = function (cfg) { try { return String((cfg.customApi && cfg.customApi.model) || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } catch (e) { return ''; } };
        // 判「是不是一張圖畫得準好幾個角色的那種」＝自訂接口型號名帶 GPT、Gemini、Banana。
        //   只拿來寫說明那一行，不鎖任何東西。（10-15 她：「只有 gemini 或者 banana 才有這種準確可以一次幾個角色的準確度」）
        const _MULTI_OK = /gpt|gemini|banana/i;
        const _isGptChar = function (cfg) {
            try {
                const svc = (cfg.serviceChar || cfg.serviceLiving || cfg.service) || '';
                if (svc !== 'custom_api') return false;
                return _MULTI_OK.test(_charModelName(cfg));
            } catch (e) { return false; }
        };
        const tavernExt = loadTavernExtSettings();

        _installSettingsHelpers();   // 切分頁、立繪 UI 的 window 小工具（定義在 launchApp 外面，見那支的註解）

        // 🔊 角色說話的聲音：總開關＋角色配音名單（OS_VOICE_CAST）＋ElevenLabs 設定
        //    以前的「Minimax／本機／全關閉」三選一拆掉了：名單上的人走他綁的雲端聲音，其他人照「沒在名單上的人」那格
        const _vcW = window.parent || window;
        const voiceCast = _vcW.OS_VOICE_CAST ? _vcW.OS_VOICE_CAST.getRoster() : { on: false, others: 'local', entries: [] };
        const elConfig = _vcW.OS_ELEVENLABS ? _vcW.OS_ELEVENLABS.getConfig() : { apiKey: '', modelId: 'eleven_v4', voices: [] };
        const elModels = (_vcW.OS_ELEVENLABS && _vcW.OS_ELEVENLABS.MODELS) || [{ id: 'eleven_v4', name: 'v4' }];
        const _vcEsc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

        const isStandalone = !!(window.OS_API && typeof window.OS_API.isStandalone === 'function' && window.OS_API.isStandalone());
        if (isStandalone) {
            llmConfig.useSystemApi = false;
            secLlmConfig.useSystemApi = false;
        }
        const stHide = isStandalone ? ' style="display:none"' : '';
        const pwaOnly = isStandalone ? '' : ' hidden';   // 只有手機版用得到的格子（加在 class 上）

        let stProfiles = [];
        let stActiveProfileId = '';
        try {
            const context = getSTContext();
            if (context && context.extensionSettings && context.extensionSettings.connectionManager) {
                stProfiles = context.extensionSettings.connectionManager.profiles || [];
                stActiveProfileId = context.extensionSettings.connectionManager.selectedProfile || '';
            }
        } catch(e) {}

        const buildProfileOptions = (currentId) => {
            const resolvedId = currentId || stActiveProfileId;
            let opts = `<option value=""${!resolvedId ? ' selected' : ''}>(當前激活的連接 / Current Active)</option>`;
            stProfiles.forEach(p => {
                const isSelected = p.id === resolvedId ? 'selected' : '';
                const safeName = p.name ? p.name.replace(/</g, "&lt;") : "Unknown";
                opts += `<option value="${_capiEsc(p.id)}" ${isSelected}><i class="fa-solid fa-folder-open"></i> ${safeName.substring(0,25)}</option>`;
            });
            return opts;
        };

        const primaryProfileOpts = buildProfileOptions(llmConfig.stProfileId);
        const secondaryProfileOpts = buildProfileOptions(secLlmConfig.stProfileId);

        // HTML 結構：整頁範本在 os_settings_page.js（參數注入 ctx＝這裡的閉包變數；範本多用一個變數，這裡也要多傳一個）
        if (!window.OS_SETTINGS_PAGE) {
            console.error('[OS_SETTINGS] os_settings_page.js 未載入');
            container.textContent = '設置頁的畫面沒有載入完整，請重新整理一次。';
            return;
        }
        container.innerHTML = window.OS_SETTINGS_PAGE.html({ llmConfig, secLlmConfig, imgConfig, minimaxConfig, vnD, voiceCast, elConfig, elModels, tavernExt, isStandalone, stHide, pwaOnly, primaryProfileOpts, secondaryProfileOpts, _vcEsc, _charModelName, _isGptChar, _capiEsc, _imgNodeOptionsHTML, _nodeVal });

        const backBtn = container.querySelector('#nav-home');
        backBtn.onclick = () => { const win = window.parent || window; if (win.PhoneSystem) win.PhoneSystem.goHome(); };

        const tabs = container.querySelectorAll('.set-tab[data-tab]');
        const views = container.querySelectorAll('.tab-view');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                views.forEach(v => v.classList.remove('active'));
                views.forEach(v => v.classList.add('hidden'));
                tab.classList.add('active');
                const targetId = `view-${tab.dataset.tab}`;
                const targetView = container.querySelector(`#${targetId}`);
                if (targetView) { targetView.classList.remove('hidden'); targetView.classList.add('active'); }
                // 換分頁從頂端看起：以前停在上一頁捲到的高度，長頁切過來會以為新分頁沒有標題（11-17 Gemini 看到）
                const _sc = container.querySelector('.set-content');
                if (_sc) _sc.scrollTop = 0;
            };
        });

        // 借接口給電腦上的 AI（os_keyrun.js 自己畫、自己管開關和倒數）
        const _keyrun = (window.parent || window).OS_KEYRUN;
        if (_keyrun) _keyrun.mount(container.querySelector('#keyrun-group'));

        // 「圖片設置」(接口/底詞/尺寸) = 系統設置裡的 tab；圖庫快取圖(頭像/背景/插圖) = 獨立「相簿」app。
        //   view-img 永遠 render，靠下面切可見性把「設定」與「圖庫」分到兩邊。
        const _imgTabBtn = container.querySelector('.set-tab[data-tab="img"]');
        const _galRow    = container.querySelector('.gal-subtab-row');
        const _galApiBtn = container.querySelector('.gal-subtab[data-galtab="api"]');
        const _apiView   = container.querySelector('#view-img-api');
        if (mode === 'album') {
            const _titleEl = container.querySelector('.set-title');
            if (_titleEl) _titleEl.textContent = '相簿';
            // 相簿只放圖庫：藏「圖片設置」子分頁與設定本體，預設顯示頭像快取
            if (_galApiBtn) _galApiBtn.style.display = 'none';
            if (_apiView)   _apiView.style.display = 'none';
            if (_imgTabBtn) _imgTabBtn.click();   // 切到 view-img
            const _avatarBtn = container.querySelector('.gal-subtab[data-galtab="avatar"]');
            if (_avatarBtn) _avatarBtn.click();   // 預設顯示頭像圖庫
            const _tabsBar = container.querySelector('.set-tabs');
            if (_tabsBar) _tabsBar.style.display = 'none';
            // 相簿只看圖、沒設定可存 → 藏「保存所有設定」footer（那是圖片設置的）
            const _footer = container.querySelector('.set-footer');
            if (_footer) _footer.style.display = 'none';
            // 內容區零上 padding，讓黏頂的畫廊主 tab 緊貼 header、捲動不露縫
            const _sc = container.querySelector('.set-content');
            if (_sc) _sc.classList.add('is-album');
        } else {
            // 系統設置：「圖片設置」tab 只給設定，藏圖庫子分頁列與快取圖（那些留給相簿）
            if (_galRow) _galRow.style.display = 'none';
            ['avatar', 'bg', 'scene'].forEach(t => {
                const v = container.querySelector(`#view-img-${t}`);
                if (v) v.style.display = 'none';
            });
            if (_apiView) _apiView.style.display = '';
        }

        // 備份分頁（在 os_settings_backup.js）
        if (window.OS_SETTINGS_BACKUP) window.OS_SETTINGS_BACKUP.bind(container);
        else console.warn('[OS_SETTINGS] os_settings_backup.js 未載入，備份分頁的按鈕停用');

        // 「一般」分頁最上面那兩格（酒館專用，PWA 那邊本來就被 stHide 藏起來）
        bindTavernTab(container);

        // 綁定元素 (主模型)
        const elSystemApi = container.querySelector('#os-system-api');
        const stProfileGroup = container.querySelector('#st-profile-group');
        const manualGroup = container.querySelector('#manual-api-group');
        const elStProfile = container.querySelector('#os-st-profile');
        const elUrl = container.querySelector('#os-api-url');
        const elKey = container.querySelector('#os-api-key');
        const elModel = container.querySelector('#os-api-model');
        const elMaxTokens = container.querySelector('#os-max-tokens');
        const elTemp = container.querySelector('#os-temperature');
        const elTopP = container.querySelector('#os-top-p');
        const elFreqPenalty = container.querySelector('#os-freq-penalty');
        const elPresPenalty = container.querySelector('#os-pres-penalty');
        const elEnableThinking = container.querySelector('#os-enable-thinking');
        const elThinkingBudget = container.querySelector('#os-thinking-budget');
        const elThinkBudgetVal = container.querySelector('#val-think-budget');
        const thinkBudgetGroup = container.querySelector('#thinking-budget-group');
        // 「幾層之後轉摘要」只有一格設定，在劇情設置的 ctxChapters，這裡不再另開一格
        const elUsePresetPrompts = container.querySelector('#os-use-preset-prompts');
        const valTemp = container.querySelector('#val-temp');
        const valTopP = container.querySelector('#val-topp');
        const valFreq = container.querySelector('#val-freq');
        const valPres = container.querySelector('#val-pres');

        // 綁定元素 (副模型)
        const secSystemApi = container.querySelector('#sec-system-api');
        const secProfileGroup = container.querySelector('#sec-st-profile-group');
        const secManualGroup = container.querySelector('#sec-manual-api-group');
        const secSyncPrimary = container.querySelector('#sec-sync-primary');
        const secSyncGroup = container.querySelector('#sec-sync-primary-group');
        const secStProfile = container.querySelector('#sec-st-profile');
        const secUrl = container.querySelector('#sec-api-url');
        const secKey = container.querySelector('#sec-api-key');
        const secModel = container.querySelector('#sec-api-model');
        const secMaxTokens = container.querySelector('#sec-max-tokens');
        const secTemp = container.querySelector('#sec-temperature');
        const secTopP = container.querySelector('#sec-top-p');
        const secFreqPenalty = container.querySelector('#sec-freq-penalty');
        const secPresPenalty = container.querySelector('#sec-pres-penalty');
        // 副模型的「僅讀取摘要」已移除（沒有任何程式讀那個欄位）
        const secUsePresetPrompts = container.querySelector('#sec-use-preset-prompts');
        const elPresetName       = container.querySelector('#os-preset-name');
        const elPresetNameGroup  = container.querySelector('#os-preset-name-group');
        const elPresetRefresh    = container.querySelector('#os-preset-refresh-btn');
        const secPresetName      = container.querySelector('#sec-preset-name');
        const secPresetNameGroup = container.querySelector('#sec-preset-name-group');
        const secPresetRefresh   = container.querySelector('#sec-preset-refresh-btn');
        const secValTemp = container.querySelector('#sec-val-temp');
        const secValTopP = container.querySelector('#sec-val-topp');
        const secValFreq = container.querySelector('#sec-val-freq');
        const secValPres = container.querySelector('#sec-val-pres');

        // 綁定元素 (圖片)
        const elAvatarSize = container.querySelector('#img-avatar-size');   // 頭像尺寸下拉（測試/儲存都讀這個）
        const elNaiGroup = container.querySelector('#img-group-nai');
        const elNaiToken = container.querySelector('#img-nai-token');
        const elNaiModel = container.querySelector('#img-nai-model');
        const elImgTestPrompt = container.querySelector('#img-test-prompt');
        const btnImgTest = container.querySelector('#img-test-btn');
        const imgTestPreview = container.querySelector('#img-test-preview');
        const imgTestImage = container.querySelector('#img-test-image');
        const imgTestUrl = container.querySelector('#img-test-url');

        // 按鈕
        const btnFetch = container.querySelector('#os-fetch-btn');
        const secFetch = container.querySelector('#sec-fetch-btn');
        const btnSave = container.querySelector('#os-save-btn');
        const btnTest = container.querySelector('#os-test-btn');
        const secTestBtn = container.querySelector('#sec-test-btn');
        const status = container.querySelector('#os-status');

        // ✏️ 主／副模型那格可以自己打模型名（11-13 小斐驗收網頁版抓到：Vertex 綁服務帳戶的金鑰拉不到模型清單（401），
        //   選單只剩預設那一個、換不了）。選單最下面一項「自己輸入模型名稱…」，選了跳輸入框，打的名字加進選單選起來；
        //   取消就回到原本選的。拉清單會整個重寫選單，所以拉完要再補回這一項（_withTypeOpt）。「我的通道」那格本來就是輸入框
        const MODEL_TYPE = '__type_model__';
        function _withTypeOpt(sel) {
            if (sel && !sel.querySelector('option[value="' + MODEL_TYPE + '"]')) sel.insertAdjacentHTML('beforeend', '<option value="' + MODEL_TYPE + '">自己輸入模型名稱…</option>');
        }
        function _wireModelType(sel) {
            if (!sel || sel.dataset.typeWired) return;
            sel.dataset.typeWired = '1';
            _withTypeOpt(sel);
            let prev = sel.value;
            sel.addEventListener('focus', () => { if (sel.value !== MODEL_TYPE) prev = sel.value; });
            sel.addEventListener('change', async () => {
                if (sel.value !== MODEL_TYPE) { prev = sel.value; return; }
                const U = window.AUI || (window.parent && window.parent.AUI);
                let v = null;
                try { v = (U && U.prompt) ? await U.prompt('模型名稱（照接口那邊寫的）', prev === MODEL_TYPE ? '' : prev) : null; } catch (e) {}
                const name = String(v == null ? '' : v).trim();
                if (!name) { sel.value = prev; return; }
                if (!Array.from(sel.options).some(o => o.value === name)) sel.insertAdjacentHTML('afterbegin', `<option value="${_capiEsc(name)}">${_capiEsc(name)}</option>`);
                sel.value = name;
                prev = name;
            });
        }
        _wireModelType(elModel);
        _wireModelType(secModel);
        const TYPE_HINT = '（模型選單最下面可以選「自己輸入模型名稱」）';
        const ST_NOTE = n => `接口那邊拉不到模型清單，先列酒館選單上的 ${n} 個；這裡沒有的選最下面「自己輸入模型名稱」`;
        // 拉清單：接口那邊拉得到就用它的；Gemini／Vertex、Claude 原生拉不到，就抄酒館選單上那份（OS_API.tavernModelList，11-13 她「抄酒館的作業」）
        //   🚨 拉完原本選的那個要留著選中：以前整個選單重寫、自動跳到第一個，沒注意就存成別的模型
        function _fillModels(sel, ids) {
            const cur = sel.value;
            const list = ids.map(x => String(x == null ? '' : x).trim()).filter(Boolean);
            if (cur && cur !== MODEL_TYPE && list.indexOf(cur) < 0) list.unshift(cur);
            // 一次組好再指派（一項一項 += 每次都整個選單重建，幾百個模型會很慢）；名字是站方給的，要轉義
            sel.innerHTML = list.map(id => `<option value="${_capiEsc(id)}">${_capiEsc(id)}</option>`).join('');
            if (cur && cur !== MODEL_TYPE) sel.value = cur;
            _withTypeOpt(sel);
        }
        async function _pullModels(sel, url, key, fmt) {
            let ids = [], why = '';
            try {
                if (fmt === 'gemini') ids = await window.OS_API.geminiModelList(url, key);   // 含 Vertex：照送生成同一套網址規則
                else {
                    // 🚨 網址本來就以 /v1 結尾（大多數站台給的都是）就別再接一層，不然變 /v1/v1/models 回 404（同 chat() 的接法）
                    const _base = url.replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
                    const fetchUrl = _base + (/\/v1$/.test(_base) ? '' : '/v1') + '/models';
                    const res = await fetch(fetchUrl, { method: 'GET', headers: window.OS_API.authHeaders(fetchUrl, key, { native: true }) });
                    if (!res.ok) throw new Error(`API 錯誤: ${res.status}`);
                    const data = await res.json();
                    ids = (data.data || data.models || []).map(m => (m && m.id) || m);
                }
            } catch (e) { why = e.message; }
            if (ids.length) { _fillModels(sel, ids); return { n: ids.length, st: false }; }
            if ((fmt === 'gemini' || fmt === 'anthropic') && window.OS_API.tavernModelList) {
                let st = [];
                try { st = await window.OS_API.tavernModelList(fmt, url); } catch (e) {}
                if (st.length) { _fillModels(sel, st); return { n: st.length, st: true }; }
            }
            throw new Error(why || 'API 返回了空列表');
        }

        // ── 🎲 決策模型三格：打字就存（os_jev_conn.js），測試一按一通 ──
        (function wireJev() {
            const J = window.OS_JEV_CONN || (window.parent && window.parent.OS_JEV_CONN);
            const box = container.querySelector('#jev-group');
            if (!box) return;
            if (!J) { box.querySelector('#jev-test-btn')?.classList.add('hidden'); return; }
            const cur = J.get();
            [['url', '#jev-url'], ['model', '#jev-model'], ['key', '#jev-key']].forEach(([k, sel]) => {
                const el = box.querySelector(sel);
                if (!el) return;
                el.value = cur[k];
                el.addEventListener('input', () => J.set({ [k]: el.value }));
            });
            const btn = box.querySelector('#jev-test-btn');
            const out = box.querySelector('#jev-test-result');
            btn?.addEventListener('click', async () => {
                if (btn.dataset.busy) return;
                btn.dataset.busy = '1';
                out.classList.remove('hidden');
                out.textContent = '問問看…';
                try {
                    const r = await J.test();
                    out.textContent = (r.ok ? '✓ ' : '✗ ') + r.msg + (r.ms ? '（' + (r.ms / 1000).toFixed(1) + ' 秒）' : '');
                } finally { delete btn.dataset.busy; }
            });
        })();

        // ── 🔌 分流表 ＋ 我的通道 ──────────────────────────────────
        (function wireChannels() {
            const routeBox = container.querySelector('#route-table');
            const listBox = container.querySelector('#channel-list');
            const addBtn = container.querySelector('#channel-add-btn');
            if (!routeBox || !listBox) return;
            const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

            // 👁 看圖三選一。跟分流表一樣畫進格子裡（selected 寫在 HTML 上），改動委派在 container 上，面板重建也不會掉
            function paintVision() {
                const box = container.querySelector('#vision-mode-box');
                if (!box) return;
                const cur = getVisionMode();
                const LABEL = { off: '不給模型看圖', main: '聊天的模型自己看', helper: '交給看圖小模型' };
                box.innerHTML = '<select class="set-select" id="vision-mode">'
                    + VISION_MODES.map(function (v) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + LABEL[v] + '</option>'; }).join('')
                    + '</select>';
            }
            if (!container.dataset.visionBound) {
                container.dataset.visionBound = '1';
                container.addEventListener('change', function (ev) {
                    const sel = ev.target && ev.target.closest ? ev.target.closest('#vision-mode') : null;
                    if (sel) setVisionMode(sel.value);
                });
            }
            paintVision();

            // 🎙 語音轉文字二選一（OS_VOICE_INPUT 的轉字方式）。這支手機用不了的那種灰掉；沒選過時選單停在實際在用的那種
            function paintVoice() {
                const box = container.querySelector('#voice-engine-box');
                const VI = (window.parent || window).OS_VOICE_INPUT;
                if (!box) return;
                if (!VI || !VI.engines) { box.innerHTML = '<div class="set-desc">語音模組還沒載入，等一下重開這頁</div>'; return; }
                const cur = VI.engineId();
                box.innerHTML = '<select class="set-select" id="voice-engine">'
                    + VI.engines().map(function (e) {
                        return '<option value="' + e.id + '"' + (cur === e.id ? ' selected' : '') + (e.supported ? '' : ' disabled') + '>'
                            + e.label + (e.supported ? '' : '（這支手機用不了）') + '</option>';
                    }).join('')
                    + '</select>';
            }
            if (!container.dataset.voiceBound) {
                container.dataset.voiceBound = '1';
                container.addEventListener('change', function (ev) {
                    const sel = ev.target && ev.target.closest ? ev.target.closest('#voice-engine') : null;
                    const VI = (window.parent || window).OS_VOICE_INPUT;
                    if (sel && VI) VI.setConfig({ engine: sel.value });
                });
            }
            paintVoice();

            function paintRoutes() {
                const routes = loadRoutes();
                const chans = loadChannels();
                let _grp = '';
                const _simsOn = !!((window.parent || window).OS_SIMS && (window.parent || window).OS_SIMS.active);
                routeBox.innerHTML = LLM_TASKS.filter(function (t) { return !t.only || (t.only === 'sims' && _simsOn); }).map(function (t) {
                    const head = (t.group && t.group !== _grp) ? '<div class="set-row-group">' + t.group + '</div>' : '';
                    if (t.group) _grp = t.group;
                    const opts = ['<option value="main"' + (routes[t.id] === 'main' ? ' selected' : '') + '>主模型</option>',
                                  '<option value="sec"' + (routes[t.id] === 'sec' ? ' selected' : '') + '>副模型</option>']
                        .concat(chans.map(function (c) {
                            return '<option value="' + esc(c.id) + '"' + (routes[t.id] === c.id ? ' selected' : '') + '>'
                                + esc(c.name || '未命名通道') + '</option>';
                        })).join('');
                    return head + '<div class="set-row-line">'
                        + '<span class="set-row-name">' + t.name + '</span>'
                        + '<select class="set-select set-row-sel" data-task="' + t.id + '">' + opts + '</select>'
                        + '</div>';
                }).join('');
                routeBox.querySelectorAll('select[data-task]').forEach(function (sel) {
                    sel.onchange = function () {
                        const routes2 = loadRoutes();
                        routes2[sel.getAttribute('data-task')] = sel.value;
                        saveRoutes(routes2);
                    };
                });
            }

            function paintChannels() {
                const chans = loadChannels();
                if (!chans.length) {
                    listBox.innerHTML = '<div class="set-desc">還沒有自訂通道。</div>';
                } else {
                    listBox.innerHTML = chans.map(function (c, i) {
                        return '<div class="set-channel" data-idx="' + i + '">'
                            + '<input class="set-input ch-name" placeholder="通道名字（例如 便宜大容量）" value="' + esc(c.name) + '">'
                            + '<input class="set-input ch-url" placeholder="API 網址" value="' + esc(c.url) + '">'
                            + '<input class="set-input ch-key" type="password" placeholder="金鑰" value="' + esc(c.key) + '">'
                            + '<input class="set-input ch-model" placeholder="模型名稱" value="' + esc(c.model) + '">'
                            // 請求格式：以前通道沒有這格、偷偷照主模型那頁的；舊通道沒存過就顯示主模型那頁的（就是它一直在用的），改了才存
                            + '<select class="set-select ch-fmt">' + [['openai', 'OpenAI 相容（多數站）'], ['gemini', 'Gemini 原生／Vertex'], ['anthropic', 'Claude 原生（有緩存）']].map(function (f) { return '<option value="' + f[0] + '"' + ((c.apiFormat || loadLlmConfig().apiFormat || 'openai') === f[0] ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select>'
                            + '<div class="set-channel-row">'
                            +   '<input class="set-input ch-max" type="number" min="256" step="256" placeholder="最大輸出" value="' + esc(c.maxTokens || '') + '">'
                            +   '<input class="set-input ch-temp" type="number" min="0" max="2" step="0.05" placeholder="溫度" value="' + esc(c.temperature == null ? '' : c.temperature) + '">'
                            +   '<div class="btn-test ch-del">刪掉</div>'
                            + '</div></div>';
                    }).join('');
                }
                listBox.querySelectorAll('.set-channel').forEach(function (box) {
                    const idx = parseInt(box.getAttribute('data-idx'), 10);
                    const save = function () {
                        const list = loadChannels();
                        if (!list[idx]) return;
                        list[idx].name = box.querySelector('.ch-name').value.trim();
                        list[idx].url = box.querySelector('.ch-url').value.trim();
                        list[idx].key = box.querySelector('.ch-key').value.trim();
                        list[idx].model = box.querySelector('.ch-model').value.trim();
                        list[idx].maxTokens = box.querySelector('.ch-max').value.trim();
                        list[idx].temperature = box.querySelector('.ch-temp').value.trim();
                        list[idx].apiFormat = box.querySelector('.ch-fmt').value;
                        saveChannels(list);
                        paintRoutes();
                    };
                    box.querySelectorAll('input, select').forEach(function (el) { el.onchange = save; });
                    box.querySelector('.ch-del').onclick = async function () {
                        const list = loadChannels();
                        const gone = list[idx];
                        if (!gone) return;
                        if (!(await AUI.confirm('刪掉通道「' + (gone.name || '未命名') + '」？指到它的項目會退回預設。', { danger: true }))) return;
                        list.splice(idx, 1);
                        if (!saveChannels(list)) return;   // 通道沒刪成，指到它的項目也別動
                        const routes = loadRoutes();
                        Object.keys(routes).forEach(function (k) { if (routes[k] === gone.id) delete routes[k]; });
                        saveRoutes(routes);
                        paintChannels(); paintRoutes();
                    };
                });
            }

            if (addBtn) addBtn.onclick = function () {
                const list = loadChannels();
                list.push({ id: 'ch_' + Date.now().toString(36), name: '', url: '', key: '', model: '', maxTokens: '', temperature: '' });
                saveChannels(list);
                paintChannels(); paintRoutes();
            };
            paintChannels();
            paintRoutes();
        })();

        // Sliders Listeners
        elTemp.oninput = () => valTemp.innerText = parseFloat(elTemp.value).toFixed(2);
        elTopP.oninput = () => valTopP.innerText = parseFloat(elTopP.value).toFixed(2);
        elFreqPenalty.oninput = () => valFreq.innerText = parseFloat(elFreqPenalty.value).toFixed(2);
        elPresPenalty.oninput = () => valPres.innerText = parseFloat(elPresPenalty.value).toFixed(2);

        if (elEnableThinking) {
            elEnableThinking.onchange = () => {
                if (thinkBudgetGroup) thinkBudgetGroup.classList.toggle('hidden', !elEnableThinking.checked);
            };
        }
        if (elThinkingBudget && elThinkBudgetVal) {
            elThinkingBudget.oninput = () => { elThinkBudgetVal.innerText = parseInt(elThinkingBudget.value).toLocaleString(); };
        }
        
        secTemp.oninput = () => secValTemp.innerText = parseFloat(secTemp.value).toFixed(2);
        secTopP.oninput = () => secValTopP.innerText = parseFloat(secTopP.value).toFixed(2);
        secFreqPenalty.oninput = () => secValFreq.innerText = parseFloat(secFreqPenalty.value).toFixed(2);
        secPresPenalty.oninput = () => secValPres.innerText = parseFloat(secPresPenalty.value).toFixed(2);

        // Toggle Logic
        const toggleInputs = (sysApi, manGroup, profGroup) => {
            if (sysApi.checked) { manGroup.style.display = 'none'; profGroup.classList.remove('hidden'); } 
            else { manGroup.style.display = 'flex'; profGroup.classList.add('hidden'); }
        };
        
        const elModelRow = container.querySelector('#model-row');
        const elModelNotice = container.querySelector('#model-system-notice');
        const secModelRow = container.querySelector('#sec-model-row');
        const secModelNotice = container.querySelector('#sec-model-system-notice');

        const toggleModelRow = (isSystem, row, notice) => {
            if (isSystem) { row.classList.add('hidden'); notice.classList.remove('hidden'); }
            else { row.classList.remove('hidden'); notice.classList.add('hidden'); }
        };

        elSystemApi.onchange = () => {
            toggleInputs(elSystemApi, manualGroup, stProfileGroup);
            toggleModelRow(elSystemApi.checked, elModelRow, elModelNotice);
        };
        toggleInputs(elSystemApi, manualGroup, stProfileGroup);
        toggleModelRow(elSystemApi.checked, elModelRow, elModelNotice);

        // 🔥 副模型特有的 Toggle 邏輯
        secSystemApi.onchange = () => {
            toggleInputs(secSystemApi, secManualGroup, secProfileGroup);
            toggleModelRow(secSystemApi.checked, secModelRow, secModelNotice);
            if (secSyncGroup) secSyncGroup.style.display = secSystemApi.checked ? 'none' : 'flex';
            if (!secSystemApi.checked && secSyncPrimary && secSyncPrimary.checked) {
                secManualGroup.style.display = 'none';
            }
        };
        
        if (secSyncPrimary) {
            secSyncPrimary.onchange = () => {
                if (secSyncPrimary.checked) {
                    secManualGroup.style.display = 'none';
                } else if (!secSystemApi.checked) {
                    secManualGroup.style.display = 'flex';
                }
            };
            if (!secSystemApi.checked) {
                secManualGroup.style.display = secSyncPrimary.checked ? 'none' : 'flex';
            }
        }
        
        toggleInputs(secSystemApi, secManualGroup, secProfileGroup);
        toggleModelRow(secSystemApi.checked, secModelRow, secModelNotice);
        if (secSyncGroup) secSyncGroup.style.display = secSystemApi.checked ? 'none' : 'flex';
        if (!secSystemApi.checked && secSyncPrimary && secSyncPrimary.checked) secManualGroup.style.display = 'none';

        // --- Preset 名稱選擇器 ---
        function populatePresetSelect(selectEl, currentName) {
            const th = window.TavernHelper || window.parent?.TavernHelper;
            if (!th || typeof th.getPresetNames !== 'function') {
                selectEl.innerHTML = '<option value="">（TavernHelper 不可用）</option>';
                return;
            }
            try {
                const names = th.getPresetNames();
                selectEl.innerHTML = '<option value="">（使用當前 in_use Preset）</option>' +
                    names.map(n => `<option value="${_capiEsc(n)}" ${n === currentName ? 'selected' : ''}>${_capiEsc(n)}</option>`).join('');
            } catch(e) {
                selectEl.innerHTML = '<option value="">（讀取失敗）</option>';
            }
        }

        if (elPresetName && llmConfig.usePresetPrompts)   populatePresetSelect(elPresetName,  llmConfig.presetName  || '');
        if (secPresetName && secLlmConfig.usePresetPrompts) populatePresetSelect(secPresetName, secLlmConfig.presetName || '');

        if (elUsePresetPrompts) elUsePresetPrompts.onchange = () => {
            if (elPresetNameGroup) elPresetNameGroup.style.display = elUsePresetPrompts.checked ? 'flex' : 'none';
            if (elUsePresetPrompts.checked && elPresetName) populatePresetSelect(elPresetName, llmConfig.presetName || '');
        };
        if (secUsePresetPrompts) secUsePresetPrompts.onchange = () => {
            if (secPresetNameGroup) secPresetNameGroup.style.display = secUsePresetPrompts.checked ? 'flex' : 'none';
            if (secUsePresetPrompts.checked && secPresetName) populatePresetSelect(secPresetName, secLlmConfig.presetName || '');
        };

        if (elPresetRefresh)  elPresetRefresh.onclick  = () => elPresetName  && populatePresetSelect(elPresetName,  elPresetName.value);
        if (secPresetRefresh) secPresetRefresh.onclick = () => secPresetName && populatePresetSelect(secPresetName, secPresetName.value);

        // --- Profile URL Info ---
        function showProfileInfo(selectEl, infoEl) {
            if (!infoEl) return;
            const selectedId = selectEl.value;
            if (!selectedId) {
                infoEl.innerHTML = '<span><i class="fa-solid fa-circle-info"></i> 使用當前激活的 ST 連接</span>';
                return;
            }
            const p = stProfiles.find(x => x.id === selectedId);
            if (!p) { infoEl.textContent = '(找不到 Profile)'; return; }
            // URL：api-url 有就用（custom/openai 直連）；空的多半是反向代理(claude 等)→ 從 profile 的 proxy 預設名解析真 URL
            let url = p['api-url'] || '';
            if (!url && p.proxy) {
                try {
                    const proxies = getSTContext()?.chatCompletionSettings?.proxies || [];
                    const pr = proxies.find(x => x && x.name === p.proxy);
                    url = (pr && pr.url) ? (pr.url + ' (代理:' + p.proxy + ')') : ('代理預設「' + p.proxy + '」未設 URL');
                } catch (_) { url = '代理預設:' + p.proxy; }
            }
            if (!url) url = '(URL 未記錄；可能走官方端點)';
            const liveModel = (() => { try { return getSTContext()?.getChatCompletionModel?.() || ''; } catch(_) { return ''; } })();
            const model = liveModel || p.model || '(模型未記錄)';
            const api = p.api ? ` <span>[${_capiEsc(p.api)}]</span>` : '';
            // 網址、模型、代理名來自酒館的連線設定（可以是匯入別人的 profile）：當純文字
            infoEl.innerHTML = `<i class="fa-solid fa-globe"></i> ${_capiEsc(url)}<br><i class="fa-solid fa-robot"></i> ${_capiEsc(model)}${api}`;
        }

        const profileInfoEl = container.querySelector('#st-profile-info');
        const secProfileInfoEl = container.querySelector('#sec-st-profile-info');
        showProfileInfo(elStProfile, profileInfoEl);
        showProfileInfo(secStProfile, secProfileInfoEl);
        elStProfile.addEventListener('change', () => showProfileInfo(elStProfile, profileInfoEl));
        secStProfile.addEventListener('change', () => showProfileInfo(secStProfile, secProfileInfoEl));

        // 📝 自訂前置指令(破甲)：每個連接預設各記各的，切預設→存舊的、載新的(避免把 A 模型的破甲送給 B 模型而被拒)
        const elCustomCot = container.querySelector('#os-custom-cot');
        const _cotKeyOf = v => (v && String(v).trim()) ? String(v) : '__none__';
        let _cotMap = Object.assign({}, llmConfig.customCotMap || {});
        let _curCotKey = _cotKeyOf(elStProfile.value);
        if (Object.keys(_cotMap).length === 0 && (llmConfig.customCot || '').trim()) _cotMap[_curCotKey] = llmConfig.customCot;   // 舊版單格一次性遷移到當前預設名下
        if (elCustomCot) elCustomCot.value = (_curCotKey in _cotMap) ? (_cotMap[_curCotKey] || '') : '';
        elStProfile.addEventListener('change', () => {
            if (!elCustomCot) return;
            _cotMap[_curCotKey] = elCustomCot.value;            // 存目前預設的破甲
            _curCotKey = _cotKeyOf(elStProfile.value);          // 切到新預設
            elCustomCot.value = (_curCotKey in _cotMap) ? (_cotMap[_curCotKey] || '') : '';   // 載新預設自己的(沒設過就空白)
        });

        function updateSmeaVisibility(model) {
            const isV3 = model === 'nai-diffusion-3';
            const smeaGrp    = container.querySelector('#img-nai-smea-group');
            const smeaDynGrp = container.querySelector('#img-nai-smea-dyn-group');
            // SMEA 僅 V3 可用：用 .is-disabled class 控制（CSS 內 opacity+pointer-events），別用 inline 避免殘留
            if (smeaGrp)    smeaGrp.classList.toggle('is-disabled', !isV3);
            if (smeaDynGrp) smeaDynGrp.classList.toggle('is-disabled', !isV3);
        }
        if (elNaiModel) elNaiModel.onchange = () => updateSmeaVisibility(elNaiModel.value);

        // 接口的顯示名（畫風頁「照原本的（…）」那一項用）
        const SVC_DISP = {
            novelai: 'NovelAI',
            tavern_sd: '酒館原生',
            comfyui_direct: 'ComfyUI 直連',
            custom_api: '自訂接口'
        };

        // ── 插圖指令／獨立插圖規範：點進去整頁編輯（跟素材頁 BGM 清單同一種頁 .vncfg-lp），自己有保存鈕、當場寫進設定 ──
        //   🚨 底部「保存所有設定」會整份重組 sceneGen，它照 imgConfig.sceneGen 帶回這幾格 → 這頁存的時候存檔跟 imgConfig 兩邊都要寫。
        //   委派綁在 container 上：設定面板之後還會重建 DOM，直接綁在鈕上會掉（reference_settings_panel_bind_traps）。
        const _SCENE_PROMPT_TABS = [
            { svc: 'novelai',        key: 'extractPromptNovelai',      label: 'NovelAI',      hint: 'NovelAI 用 Danbooru 標籤（五層系統）。' },
            { svc: 'tavern_sd',      key: 'extractPromptTavern',       label: '酒館原生',     hint: '寫自然語言英文句子。' },
            { svc: 'comfyui_direct', key: 'extractPromptComfy',        label: 'ComfyUI',      hint: '寫自然語言英文句子。' },
            // 🚨 加新的插圖來源時加在這裡，不然那個來源沒有自己的一份可改
            { svc: 'custom_api',     key: 'extractPromptCustom',       label: '自訂接口',     hint: '寫自然語言英文句子。' },
        ];
        const _openScenePromptPage = (btn, which) => {
            try {
                const setc = btn.closest('.set-container');
                const host = (setc && setc.parentElement) || btn.ownerDocument.body;
                const pdoc = host.ownerDocument || document;
                if (getComputedStyle(host).position === 'static') host.classList.add('vncfg-lp-host');
                host.querySelectorAll(':scope > .vncfg-lp').forEach(p => p.remove());
                const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const norm = s => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim();
                const defs = loadImageConfig({ defaults: true }).sceneGen || {};
                if (!imgConfig.sceneGen) imgConfig.sceneGen = {};
                const sg = imgConfig.sceneGen;
                const solo = which === 'standalone';
                const tabs = solo
                    ? [{ key: 'standaloneSpec', label: '獨立插圖規範', hint: '開了「獨立插圖副模型」才用：插圖另開一通副模型，只吃這份規範。' }]
                    : _SCENE_PROMPT_TABS;
                const drafts = {}, saved = {};
                tabs.forEach(t => { saved[t.key] = drafts[t.key] = String(sg[t.key] == null ? (defs[t.key] || '') : sg[t.key]); });
                const _imM = (window.parent || window).OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
                const svcNow = (_imM && _imM.serviceForUse) ? _imM.serviceForUse('scene') : (imgConfig.serviceScene || '');
                let cur = (tabs.find(t => t.svc && t.svc === svcNow) || tabs[0]).key;

                const page = pdoc.createElement('div');
                page.className = 'vncfg-lp';
                page.innerHTML = `
                    <div class="set-header sysh">
                        <div class="set-back-btn sysh-back vncfg-lp-back">‹</div>
                        <div class="set-title sysh-title">${solo ? '獨立插圖規範' : '插圖指令'}</div>
                        <div class="sysh-acts"><button type="button" class="vncfg-lp-save">保存</button></div>
                    </div>
                    ${solo ? '' : `<div class="vncfg-lp-tabs">${tabs.map(t => `<button type="button" class="vncfg-lp-tab" data-id="${t.key}">${esc(t.label)}</button>`).join('')}</div>`}
                    <div class="vncfg-lp-bar"><span class="vncfg-lp-count"></span><button type="button" class="set-btn vncfg-lp-reset">還原預設</button></div>
                    <textarea class="vncfg-lp-ta" spellcheck="false"></textarea>
                    <div class="vncfg-lp-hint"></div>`;
                host.appendChild(page);

                const ta = page.querySelector('.vncfg-lp-ta');
                const tabOf = key => tabs.find(t => t.key === key);
                const paint = () => {
                    page.querySelectorAll('.vncfg-lp-tab').forEach(b => {
                        b.classList.toggle('is-on', b.dataset.id === cur);
                        b.classList.toggle('is-changed', norm(drafts[b.dataset.id]) !== norm(defs[b.dataset.id] || ''));
                    });
                    page.querySelector('.vncfg-lp-count').textContent = String(drafts[cur] || '').length + ' 字';
                    const t = tabOf(cur);
                    page.querySelector('.vncfg-lp-hint').textContent = (t.svc && t.svc === svcNow ? '插圖來源現在用的就是這份。' : '') + t.hint;
                };
                ta.value = drafts[cur];
                paint();

                ta.addEventListener('input', () => { drafts[cur] = ta.value; paint(); });
                const tabsEl = page.querySelector('.vncfg-lp-tabs');
                if (tabsEl) tabsEl.addEventListener('click', ev => {
                    const b = ev.target.closest('.vncfg-lp-tab');
                    if (!b || b.dataset.id === cur) return;
                    drafts[cur] = ta.value;
                    cur = b.dataset.id;
                    ta.value = drafts[cur];
                    ta.scrollTop = 0;
                    paint();
                });
                page.querySelector('.vncfg-lp-reset').onclick = () => { ta.value = defs[cur] || ''; drafts[cur] = ta.value; paint(); };
                page.querySelector('.vncfg-lp-save').onclick = () => {
                    drafts[cur] = ta.value;
                    const patch = {};
                    tabs.forEach(t => { patch[t.key] = t.key === 'standaloneSpec' ? drafts[t.key] : String(drafts[t.key] || '').trim(); });
                    const b = page.querySelector('.vncfg-lp-save');
                    try {
                        const all = JSON.parse(localStorage.getItem(IMG_STORAGE_KEY) || '{}');
                        all.sceneGen = Object.assign({}, all.sceneGen || {}, patch);
                        // 存不進去（本機空間滿）lsSet 會跳提示：鈕寫「存不進去」，草稿照留著，畫面上的也別當成已保存
                        if (!_lsSet(IMG_STORAGE_KEY, JSON.stringify(all), '插圖指令')) { b.textContent = '存不進去'; setTimeout(() => { b.textContent = '保存'; }, 1400); return; }
                        Object.assign(sg, patch);
                        tabs.forEach(t => { saved[t.key] = drafts[t.key]; });
                        b.textContent = '已保存 ✓';
                    } catch (e) { b.textContent = '存不進去'; console.warn('[設置] 插圖指令保存失敗:', e); }
                    setTimeout(() => { b.textContent = '保存'; }, 1400);
                };
                page.querySelector('.vncfg-lp-back').onclick = async () => {
                    try {
                        drafts[cur] = ta.value;
                        if (tabs.some(t => drafts[t.key] !== saved[t.key])) {
                            const A = window.AUI || (window.parent && window.parent.AUI);
                            if (A && A.confirm && !(await A.confirm('還沒保存，確定要離開嗎？'))) return;
                        }
                        page.remove();
                    } catch (e) { console.warn('[設置] 關閉插圖指令頁失敗:', e); page.remove(); }
                };
            } catch (e) { console.warn('[設置] 打開插圖指令頁失敗:', e); }
        };
        if (!container.dataset.scenePromptBound) {
            container.dataset.scenePromptBound = '1';
            container.addEventListener('click', (ev) => {
                const b = ev.target && ev.target.closest ? ev.target.closest('.img-scene-prompt-open') : null;
                if (b) _openScenePromptPage(b, b.dataset.scenePage);
            });
        }
        const elTavGroup      = container.querySelector('#img-group-tavernsd');
        const elCfdGroup      = container.querySelector('#img-group-comfyui');
        const elCapiGroup     = container.querySelector('#img-group-customapi');

        // 🎨 自訂接口的底詞包、底詞格：2026-11-17 併進「我的畫風」（她：「併成一份」），這裡的事件拿掉了。舊資料怎麼轉見 _mergeCapiBase。
        const _capiAUI = () => (window.parent && window.parent.AUI) || window.AUI;   // 下面節點那段也用

        // 🔌 節點：換節點＝把那組填回格子，而且當下寫進設定（不必再按儲存）。事件一律委派在 container，理由同底下「測試」鈕。
        const _nodeCur = (kind) => {
            const K = IMG_NODE_KINDS[kind], o = {};
            Object.keys(K.fields).forEach(f => {
                const el = container.querySelector(K.fields[f]);
                o[f] = (el && el.type === 'checkbox') ? (el.checked ? '1' : '') : ((el && el.value) || '').trim();
            });
            return o;
        };
        const _nodeSay = (kind, msg) => { const el = container.querySelector(IMG_NODE_KINDS[kind].status); if (el) el.textContent = msg; };
        const _nodeRefill = (kind, pickId) => {
            const sel = container.querySelector(IMG_NODE_KINDS[kind].select);
            if (sel) sel.innerHTML = _imgNodeOptionsHTML(kind, _nodeCur(kind), pickId);
        };
        const _nodeApply = (kind, vals) => {
            const K = IMG_NODE_KINDS[kind], patch = {};
            Object.keys(K.fields).forEach(f => {
                patch[f] = _nodeVal(vals[f]);
                const el = container.querySelector(K.fields[f]);
                if (el && el.type === 'checkbox') el.checked = patch[f] === '1';
                else if (el) el.value = patch[f];
            });
            try {
                const saved = JSON.parse(localStorage.getItem(IMG_STORAGE_KEY) || '{}');
                saved[K.cfgKey] = Object.assign({}, saved[K.cfgKey] || {}, patch);
                _lsSet(IMG_STORAGE_KEY, JSON.stringify(saved), '圖片設定');
            } catch (e) {}
            try {
                const IM = (window.parent && window.parent.OS_IMAGE_MANAGER) || window.OS_IMAGE_MANAGER;
                if (IM && IM.config) IM.config[K.cfgKey] = Object.assign({}, IM.config[K.cfgKey] || {}, patch);
            } catch (e) {}
        };
        container.addEventListener('change', function (ev) {
            const t = ev.target;
            if (!t || !t.closest) return;
            for (const kind in IMG_NODE_KINDS) {
                // 開關類欄位只會發 change（有些瀏覽器不發 input）→ 一樣讓下拉重新認
                if (t.type === 'checkbox' && Object.values(IMG_NODE_KINDS[kind].fields).some(s => t.closest(s))) { _nodeRefill(kind); return; }
                const sel = t.closest(IMG_NODE_KINDS[kind].select);
                if (!sel) continue;
                const n = _imgNodes(kind).find(x => x.id === sel.value);
                if (!n) { _nodeRefill(kind); return; }
                _nodeApply(kind, n);
                _nodeSay(kind, '換到「' + n.name + '」了');
                return;
            }
        });
        // 手動改了格子 → 下拉跟著認：改到跟某個節點一樣就停在它，不一樣就顯示「目前這組還沒存」
        container.addEventListener('input', function (ev) {
            const t = ev.target;
            if (!t || !t.closest) return;
            for (const kind in IMG_NODE_KINDS) {
                if (Object.values(IMG_NODE_KINDS[kind].fields).some(s => t.closest(s))) { _nodeRefill(kind); return; }
            }
        });
        container.addEventListener('click', async function (ev) {
            const t = ev.target;
            if (!t || !t.closest) return;
            for (const kind in IMG_NODE_KINDS) {
                const K = IMG_NODE_KINDS[kind];
                const saveBtn = t.closest(K.select + '-save');
                const delBtn = t.closest(K.select + '-del');
                if (!saveBtn && !delBtn) continue;
                const A = _capiAUI();
                const nodes = _imgNodes(kind);
                const sel = container.querySelector(K.select);
                const picked = nodes.find(x => x.id === (sel && sel.value));
                if (saveBtn) {
                    const cur = _nodeCur(kind);
                    if (!cur.url) { _nodeSay(kind, '網址是空的，沒東西可以存'); return; }
                    const name = A && A.prompt ? await A.prompt('這個節點叫什麼', picked ? picked.name : '') : '';
                    if (name == null) return;
                    const nm = String(name).trim();
                    if (!nm) return;
                    let target = nodes.find(x => x.name === nm);
                    if (target) {
                        if (A && A.confirm && !(await A.confirm('已經有一個節點叫「' + nm + '」，要用現在這組蓋掉它嗎？'))) return;
                        Object.assign(target, cur);
                    } else {
                        target = Object.assign({ id: K.idPrefix + Date.now().toString(36), name: nm }, cur);
                        nodes.push(target);
                    }
                    _imgNodesSave(kind, nodes);
                    _nodeApply(kind, cur);
                    _nodeRefill(kind, target.id);
                    _nodeSay(kind, '存成「' + nm + '」了，現在用的就是它');
                    return;
                }
                if (!picked) { _nodeSay(kind, '先在左邊選要刪哪個節點'); return; }
                if (A && A.confirm && !(await A.confirm('刪掉節點「' + picked.name + '」？下面格子裡現在填的不會動。'))) return;
                _imgNodesSave(kind, nodes.filter(x => x.id !== picked.id));
                _nodeRefill(kind);
                _nodeSay(kind, '「' + picked.name + '」刪掉了');
                return;
            }
        });

        // 自訂接口「測試」：用畫面上當下的三格去打一張小圖，不必先按儲存。
        // 錯誤原文直接寫在鈕下面 —— 接口填錯八成是網址少一段或型號名不對，要看得到才改得動。
        // 🚨 用委派綁在 container 上，不要直接綁那顆鈕：設定面板在這批 querySelector 之後
        //    還會把 DOM 重建一次（clone 會帶走屬性但不帶監聽器），直接綁等於綁在被丟掉的那顆上，
        //    症狀是「鈕在、看得見、點得到，就是沒反應」，而且完全不報錯。
        container.addEventListener('click', async function (ev) {
            const btn = ev.target && ev.target.closest && ev.target.closest('#img-capi-test');
            if (!btn || btn.disabled) return;
            // 這幾格一律點下去當場再查一次，理由同上：綁定當時抓的參照可能已經不是畫面上那顆
            const q = (sel) => container.querySelector(sel);
            const st = q('#img-capi-status');
            const say = (t) => { if (st) st.textContent = t; };
            const url   = (q('#img-capi-url')?.value   || '').trim();
            const key   = (q('#img-capi-key')?.value   || '').trim();
            const model = (q('#img-capi-model')?.value || '').trim();
            if (!url)   { say('請先填接口位址'); return; }
            // SD WebUI 格式的站（網址帶 /sdapi）模型是伺服器端設定，請求裡不帶 → 不強迫她填
            const _isSd = /\/sdapi(\/|$)/.test(url);
            if (!model && !_isSd) { say('請先填模型名（照站方寫的一字不差）'); return; }
            // 🚨 這裡不能用 win —— 那個別名只存在於本檔某幾個函式裡，在這個 scope 是 ReferenceError。
            //    而 handler 是 async，丟出來的例外變成沒人接的 rejection：按了完全沒反應、console 也不紅。
            const IM = (window.parent && window.parent.OS_IMAGE_MANAGER) || window.OS_IMAGE_MANAGER;
            if (!IM || typeof IM._genCustomApi !== 'function') { say('生圖模組還沒載入'); return; }
            // 🚨 用她實際要生的尺寸去測，不要寫死一個好過的方形 ——
            //    有些站只吃固定幾種長寬比，測 512×512（1:1）過了不代表 1024×768 也過，
            //    那種「測試通過但實際生圖失敗」比沒有測試更誤導。
            const sizeStr = (q('#img-bg-size')?.value || '1024x1024');
            const wh = sizeStr.split('x').map(Number);
            const tw = wh[0] || 1024, th = wh[1] || 1024;
            btn.disabled = true; say('測試中…（用 ' + tw + '×' + th + ' 生一張，可能要等十幾秒）');
            const prev = IM._lastCustomApiError; IM._lastCustomApiError = null;
            try {
                // 帶參考圖開著：一起測站方收不收附件。畫一張簡單的圖當參考，不必先有角色。
                const _refOn = !!q('#img-capi-ref')?.checked;
                let _refBlobs;
                if (_refOn) {
                    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
                    const g = cv.getContext('2d');
                    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
                    g.fillStyle = '#d33'; g.beginPath(); g.arc(256, 256, 180, 0, Math.PI * 2); g.fill();
                    _refBlobs = [{ name: 'the red ball', blob: await new Promise(r => cv.toBlob(r, 'image/png')) }];
                }
                const out = await IM._genCustomApi(_refOn ? 'a cat playing with the red ball on a wooden table' : 'a cat sitting on a wooden table', 'bg',
                    { width: tw, height: th, refBlobs: _refBlobs, customApi: { url: url, apiKey: key, model: model,
                        quality: (q('#img-capi-quality')?.value || 'medium'),
                        basePrompt: '',   // 底詞格 11-17 併進我的畫風了
                        refImages: _refOn } });
                if (out) say('通了，' + tw + '×' + th + ' 這個尺寸生得出圖' + (_refOn ? '，帶參考圖也收' : ''));
                else say(((IM._lastCustomApiError && IM._lastCustomApiError.msg) || '沒拿到圖'));
            } catch (e) {
                say(((e && e.message) || e));
            } finally {
                btn.disabled = false;
                if (!IM._lastCustomApiError) IM._lastCustomApiError = prev;
            }
        });
        // ════════════════════════════════════════════════════════════════
        // 🎨 圖片設置：分頁照接口分＋「畫風」頁（2026-09-24，她定的：「就像 API 接口那樣」）
        //   前五頁只管連線、存成一組一組；「畫風」頁一個地方一列，選用哪組、哪個畫風、多大。
        //   每列的選擇存在 OS_IMAGE_MANAGER（os_img_routes／os_img_styles），選了就存，不用按底部保存。
        //   🔴 加新的生圖地方：去 os_image_manager.js 的 USES 加一列，這頁自動多一列。
        // ════════════════════════════════════════════════════════════════
        const _IM = () => { const w = window.parent || window; return w.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER; };
        const _ie = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const _ihelp = (k) => (window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn(k) : '';
        // NAI 預設包是底下才宣告的 let（naiPresets）；畫面第一次畫的時候還拿不到 → 退回存檔裡那份
        const _naiList = () => { try { return naiPresets; } catch (e) { return (imgConfig.novelai && imgConfig.novelai.naiPresets) || []; } };
        const _cfdList = () => (window._cfdGetPresets ? window._cfdGetPresets() : ((imgConfig.comfyuiDirect && imgConfig.comfyuiDirect.presets) || []));
        // 組合（預設包）現在就寫進存檔：列指到的組合要真的存在，不然她沒按底部保存、那一列就退回照舊
        const _persistImgPresets = () => {
            try {
                const raw = localStorage.getItem(IMG_STORAGE_KEY);
                const cfg = raw ? JSON.parse(raw) : {};
                cfg.comfyuiDirect = Object.assign({}, cfg.comfyuiDirect || {}, { presets: _cfdList() });
                cfg.novelai = Object.assign({}, cfg.novelai || {}, { naiPresets: _naiList() });
                if (!_lsSet(IMG_STORAGE_KEY, JSON.stringify(cfg), '預設包')) return;   // 跟以前寫失敗時一樣：生圖那份也先別換
                const M = _IM();
                if (M && M.config) {
                    M.config.comfyuiDirect = Object.assign({}, M.config.comfyuiDirect || {}, { presets: _cfdList() });
                    M.config.novelai = Object.assign({}, M.config.novelai || {}, { naiPresets: _naiList() });
                }
            } catch (e) { console.warn('[圖片設置] 組合寫不進存檔:', e); }
        };
        window._imgPersistPresets = _persistImgPresets;

        const IMG_TABS = ['style', 'novelai', 'comfyui_direct', 'tavern_sd', 'custom_api'].filter(t => !(isStandalone && t === 'tavern_sd'));   // 網頁版沒有酒館
        let imgTab = 'style';
        try { const t = localStorage.getItem('os_img_settings_tab'); if (IMG_TABS.indexOf(t) >= 0) imgTab = t; } catch (e) {}
        const _tabGroups = { novelai: [elNaiGroup], comfyui_direct: [elCfdGroup], tavern_sd: [elTavGroup], custom_api: [elCapiGroup] };
        window._switchImgTab = (tab, quiet) => {
            const _prevImgTab = imgTab;
            imgTab = IMG_TABS.indexOf(tab) >= 0 ? tab : 'style';
            _lsSet('os_img_settings_tab', imgTab, '圖片設置停在哪一頁');
            if (!quiet && _prevImgTab !== imgTab) {   // 換圖片的小分頁也從頂端看起（畫風頁很長）
                const _sc = container.querySelector('.set-content');
                const _tabsTop = container.querySelector('.img-conn-tabs');
                if (_sc && _tabsTop) _sc.scrollTop = Math.max(0, _tabsTop.offsetTop - 8);
            }
            container.querySelectorAll('.img-conn-tabs .img-srctab').forEach(b => b.classList.toggle('active', b.dataset.imgtab === imgTab));
            const st = container.querySelector('#img-tab-style');
            if (st) st.hidden = (imgTab !== 'style');
            Object.keys(_tabGroups).forEach(k => _tabGroups[k].forEach(el => { if (el) el.classList.toggle('hidden', k !== imgTab); }));
            const itB = container.querySelector('#img-nai-item-block');
            if (itB) itB.classList.remove('hidden');
            if (imgTab === 'style') { _renderImgUses(); _renderRoomBlock(); if (!quiet) _imgStyleSplitNotice(); }
            if (imgTab === 'custom_api') _renderImgStyles();   // 我的畫風 2026-11-17 搬進自訂接口那頁
            if (imgTab === 'tavern_sd') _paintTavernSd();
        };
        // 🍺 酒館那頁沒有要填的（生圖全照酒館「圖像生成」擴充那邊）：顯示那邊現在選的後端，名字照酒館自己下拉單上的字。
        //   10-06 以前這格是空的（09-19 說明搬進小問號時搬錯地方），她以為壞了。
        function _paintTavernSd() {
            const el = container.querySelector('#img-tavern-src');
            if (!el) return;
            const pw = window.parent || window;
            let ctx = null;
            try { ctx = (pw.SillyTavern && pw.SillyTavern.getContext) ? pw.SillyTavern.getContext() : null; } catch (e) {}
            const ext = ctx && ctx.extensionSettings;
            let text, off = true;
            if (!ext) text = '這裡沒有酒館，用不了';
            else if ((ext.disabledExtensions || []).indexOf('stable-diffusion') >= 0) text = '酒館的「圖像生成」擴充是關著的';
            else {
                const sd = ext.sd || {};
                const src = String(sd.source || '');
                if (!src) text = '酒館的「圖像生成」還沒選後端';
                else {
                    let name = src;
                    try {
                        const o = pw.document.querySelector('#sd_source option[value="' + src.replace(/["\\]/g, '') + '"]');
                        if (o && o.textContent.trim()) name = o.textContent.trim();
                    } catch (e) {}
                    text = name + (sd.model ? '・' + sd.model : '');
                    off = false;
                }
            }
            el.textContent = text;
            el.classList.toggle('is-off', off);
        }

        // ── 每列第一格「接口」與第二格「那個接口的包」的選項（2026-11-17 改：以前一格「用哪組」混著接口和包，又疊一格跨接口的畫風）──
        //   第一格：NAI／ComfyUI／酒館／自訂接口（自訂接口存好的節點各一項）。存進 os_img_routes 的 conn 照舊：
        //   nai、nai:<包>、comfy、comfy:<包>、tavern、capi、capi:<節點>。第二格：NAI、ComfyUI 寫 conn（選包）；自訂接口寫 style（畫風）。
        const _svcChoices = () => {
            const out = [{ id: 'nai', name: 'NAI' }, { id: 'comfy', name: 'ComfyUI' }, { id: 'tavern', name: '酒館的生圖' }, { id: 'capi', name: '自訂接口・目前那組' }];
            _imgNodes('capi').forEach(n => { if (n && n.id && n.url) out.push({ id: 'capi:' + n.id, name: '自訂接口・' + (n.name || n.model || n.url) }); });
            return out;
        };
        const _packChoices = (fam) => {
            if (fam === 'nai') {
                const out = [{ id: 'nai', name: '目前的設定' }];
                _naiList().forEach(p => { if (p && p.id) out.push({ id: 'nai:' + p.id, name: p.name || '未命名' }); });
                return out;
            }
            if (fam === 'comfy') {
                const out = [{ id: 'comfy', name: '目前的設定' }];   // ComfyUI 頁面板上存的那份（底部保存）
                _cfdList().forEach(p => { if (p && p.name) out.push({ id: 'comfy:' + p.name, name: p.name }); });
                return out;
            }
            return [];
        };
        // conn → 第一格的值（nai:<包> 算 nai；自訂接口的節點各自是一項）
        const _famOf = (conn) => {
            conn = String(conn || '');
            if (!conn) return '';
            if (conn === 'nai' || conn.indexOf('nai:') === 0) return 'nai';
            if (conn === 'comfy' || conn.indexOf('comfy:') === 0) return 'comfy';
            return conn;   // tavern／capi／capi:<節點>
        };
        const _FAM_OF_SVC = { novelai: 'nai', comfyui_direct: 'comfy', tavern_sd: 'tavern', custom_api: 'capi' };
        // 有「原本的底詞」的列（劇情頭像、背景、物品本來就自己拼一段底詞）
        const LEGACY_STYLE = { avatar: '原本的頭像底詞', bg: '原本的背景底詞', item: '原本的物品底詞' };
        const FIXED_SIZE = { item: '跟著用它的地方', map: '1024×512', phone: '1024×1024', app: '跟著應用', doll: '寬圖（三隻並排）' };
        const SPRITE_SIZES = [['512x896', '512×896（窄·瘦）'], ['640x896', '640×896（標準）'], ['704x896', '704×896（寬·鎧甲）'], ['768x896', '768×896（超寬·厚甲）']];
        const _parking = () => container.querySelector('#img-size-parking');
        function _renderImgUses() {
            const box = container.querySelector('#img-use-table');
            const M = _IM();
            if (!box || !M || !M.USES) return;
            // 搬進列裡的尺寸下拉先搬回停車格，不然重畫會把它們一起刪掉（存檔讀的就是它們）
            const park = _parking();
            if (park) box.querySelectorAll('#img-avatar-size, #img-scene-size, #img-scene-size-custom, #img-bg-size').forEach(el => park.appendChild(el));
            try { _pinComfyLegacyRows(); } catch (e) {}   // 刪掉某個包之後，用它的列在這裡接回一模一樣的包
            const routes = M.getRoutes(), styles = M.getStyles(), svcs = _svcChoices();
            // 有列還沒選接口（新玩家一開始全是）：在表格上面講清楚要先去哪裡接（11-17 Gemini：沒有引導去哪裡新增）
            const _unset = M.USES.filter(u => !M.serviceForUse(u.id)).length;
            const _hint = _unset
                ? '<div class="img-use-hint"><i class="fa-solid fa-circle-info"></i> 有 ' + _unset + ' 個地方還沒選接口，那些地方不會出圖。先到上面'
                    + ['novelai:NAI', 'comfyui_direct:ComfyUI', 'custom_api:自訂接口'].concat(isStandalone ? [] : ['tavern_sd:酒館']).map(x => { const k = x.split(':'); return '<a class="img-use-hint-go" onclick="window._switchImgTab && window._switchImgTab(\'' + k[0] + '\')">' + k[1] + '</a>'; }).join('、')
                    + '其中一頁接好，再回來這裡每一列選接口。</div>'
                : '';
            box.innerHTML = _hint + M.USES.map(u => {
                const r = routes[u.id] || {};
                const legacySvc = M.legacyServiceOf(u.id);
                const fam = _famOf(r.conn);
                const showFam = fam || _FAM_OF_SVC[legacySvc] || '';
                // 第一格：接口。原本是 ComfyUI 的列不給「照原本的」：那份舊設定改不到，選了等於把 LoRA 鎖死
                const svcOpts = ((legacySvc === 'comfyui_direct' && r.conn) ? '' : '<option value=""' + (fam ? '' : ' selected') + '>' + (legacySvc ? '照原本的（' + _ie(SVC_DISP[legacySvc] || legacySvc) + '）' : '還沒選') + '</option>')
                    + svcs.filter(c => !(isStandalone && c.id === 'tavern' && fam !== 'tavern')).map(c => '<option value="' + _ie(c.id) + '"' + (c.id === fam ? ' selected' : '') + '>' + _ie(c.name) + '</option>').join('');
                // 第二格：那個接口自己的東西
                let second = '', secondLabel = '預設包';
                if (showFam === 'nai' || showFam === 'comfy') {
                    const cur = (fam === showFam && r.conn) ? r.conn : showFam;
                    second = '<select class="set-select img-use-pack" data-use="' + u.id + '">'
                        + _packChoices(showFam).map(c => '<option value="' + _ie(c.id) + '"' + (c.id === cur ? ' selected' : '') + '>' + _ie(c.name) + '</option>').join('')
                        + '</select>';
                } else if (showFam === 'capi' || showFam.indexOf('capi:') === 0) {
                    secondLabel = '畫風';
                    const leg = LEGACY_STYLE[u.id];
                    second = '<select class="set-select img-use-style" data-use="' + u.id + '">'
                        + '<option value=""' + ((!r.style || (!leg && r.style === 'none')) ? ' selected' : '') + '>' + (leg || '不加') + '</option>'
                        + (leg ? '<option value="none"' + (r.style === 'none' ? ' selected' : '') + '>不加</option>' : '')
                        + styles.map(s => '<option value="' + _ie(s.id) + '"' + (s.id === r.style ? ' selected' : '') + '>' + _ie(s.name) + '</option>').join('')
                        + '</select>';
                } else if (showFam === 'tavern') {
                    second = '<span class="img-use-fixed">照酒館那邊的設定</span>';
                } else {
                    second = '<span class="img-use-fixed">先選接口</span>';
                }
                const size = FIXED_SIZE[u.id]
                    ? '<span class="img-use-fixed">' + FIXED_SIZE[u.id] + '</span>'
                    : (u.id === 'sprite'
                        ? '<select class="set-select img-use-sprite-size">' + SPRITE_SIZES.map(z => '<option value="' + z[0] + '"' + ((localStorage.getItem('os_sprite_size') || '512x896') === z[0] ? ' selected' : '') + '>' + z[1] + '</option>').join('') + '</select>'
                        : '');
                return '<div class="img-use-row" data-use="' + u.id + '">'
                    + '<div class="img-use-name">' + _ie(u.name) + '</div>'
                    + '<span class="img-use-label">接口</span><select class="set-select img-use-svc" data-use="' + u.id + '">' + svcOpts + '</select>'
                    + '<span class="img-use-label">' + secondLabel + '</span><div class="img-use-second">' + second + '</div>'
                    + '<span class="img-use-label">尺寸</span><div class="img-use-size" data-use="' + u.id + '">' + size + '</div>'
                    + '</div>';
            }).join('');
            const slot = (id) => box.querySelector('.img-use-size[data-use="' + id + '"]');
            const mv = (sel, id) => { const el = container.querySelector(sel), s = slot(id); if (el && s) s.appendChild(el); };
            mv('#img-avatar-size', 'avatar'); mv('#img-scene-size', 'scene'); mv('#img-scene-size-custom', 'scene'); mv('#img-bg-size', 'bg');
        }
        const _useBox = container.querySelector('#img-use-table');
        if (_useBox) _useBox.addEventListener('change', (e) => {
            const t = e.target, M = _IM();
            if (!M || !t || !t.classList) return;
            const use = t.getAttribute('data-use');
            if (t.classList.contains('img-use-svc')) {
                // 換接口：nai／comfy 先接「目前的設定」，第二格再挑包；整列重畫（第二格換成那個接口的東西）
                M.setRoute(use, { conn: t.value });
                if (use === 'sprite') _refreshSpriteBatchNote();
                _renderImgUses();
                _renderImgStyles();
            } else if (t.classList.contains('img-use-pack')) {
                if (/^(comfy|nai):/.test(t.value)) _persistImgPresets();
                M.setRoute(use, { conn: t.value });
                if (use === 'sprite') _refreshSpriteBatchNote();
            } else if (t.classList.contains('img-use-style')) {
                M.setRoute(use, { style: t.value });
                _renderImgStyles();
            } else if (t.classList.contains('img-use-sprite-size')) {
                // 立繪比例跟立繪工作室那格是同一個設定
                _lsSet('os_sprite_size', t.value, '立繪比例');
                const studio = document.getElementById('sprite-base-size');
                if (studio) studio.value = t.value;
            }
        });
        // 「一次生幾個角色」底下那行字：看立繪那列現在接的是不是 GPT
        function _refreshSpriteBatchNote() {
            const M = _IM();
            const el = container.querySelector('#vncfg-sprite-batch-row .set-desc');
            if (!el || !M) return;
            let model = '';
            try {
                const r = M.getRoutes().sprite || {};
                const hit = r.conn ? M._resolveConn(r.conn) : null;
                const svc = hit ? hit.provider : M.legacyServiceOf('sprite');
                if (svc === 'custom_api') model = String(((hit && hit.customApi) || M.config.customApi || {}).model || '');
            } catch (e) {}
            el.innerHTML = '湊滿就一起生；劇情只冒出一個角色時照樣單獨生，不會等。<br>' + (_MULTI_OK.test(model)
                ? '立繪現在接的是 <b>' + _ie(model) + '</b>，就是它擅長的事。'
                : '會照指令把畫面分成等寬直欄的是 GPT、Gemini（NanoBanana）那幾種；畫風鬆散的接口可能把幾個角色糊在一起。');
        }

        // ── 我的畫風：一包＝名字＋底詞＋負詞＋（可選）一張底圖 ──
        const STYLE_IMG_PREFIX = 'imgstyle_';   // 底圖在 OS_DB 圖庫的編號前綴（相簿只列 char_img::，不會掃到）
        const _dbw = () => { const w = window.parent || window; return w.OS_DB || window.OS_DB; };
        function _renderImgStyles() {
            const box = container.querySelector('#img-style-list');
            const M = _IM();
            if (!box || !M) return;
            const list = M.getStyles();
            if (!list.length) { box.innerHTML = '<div class="img-style-empty">還沒有畫風</div>'; return; }
            box.innerHTML = list.map(s => {
                const used = _styleUsedBy(s.id);
                return '<div class="img-style-item">'
                    + '<div class="img-style-thumb" data-ref="' + _ie(s.ref || '') + '">' + (s.ref ? '' : '<i class="fa-solid fa-palette"></i>') + '</div>'
                    + '<div class="img-style-main"><div class="img-style-name">' + _ie(s.name) + '</div>'
                    + '<div class="img-style-use">' + (used.length ? '用在：' + _ie(used.join('、')) : '還沒有地方用') + '</div></div>'
                    + '<button class="set-btn img-style-btn" type="button" onclick="window._imgStyle.edit(' + _ie(JSON.stringify(String(s.id))) + ')" aria-label="修改"><i class="fa-solid fa-pen"></i></button>'
                    + '<button class="set-btn img-style-btn is-del" type="button" onclick="window._imgStyle.del(\'' + _ie(s.id) + '\')" aria-label="刪除"><i class="fa-solid fa-trash"></i></button>'
                    + '</div>';
            }).join('');
            const D = _dbw();
            if (D && D.getImage) box.querySelectorAll('.img-style-thumb[data-ref]').forEach(async el => {
                const id = el.getAttribute('data-ref');
                if (!id) return;
                try { const url = await D.getImage(id); if (url) el.style.backgroundImage = "url('" + url + "')"; } catch (e) {}
            });
        }
        // 🧩 2026-11-17 自訂接口的「底詞包」「底詞格」併進我的畫風（她：「併成一份」）。只跑一次（os_img_capi_merge_v1）：
        //   ① 每個底詞包變一包畫風（同名同字的不重複建）；
        //   ② 底詞格裡的字（以前每張自訂接口的圖都接在後面）變一包「自訂接口原本的底詞」：
        //      走自訂接口、還沒選畫風（或選「不加」）的列改用它；本來就選了別的畫風的列只剩那包（列給她看）；
        //      房間走自訂接口、沒選畫風的也接上它（房間以前沒選就借底詞格）；
        //   ③ 底詞格清空，引擎不再在後面多接一段。
        const CAPI_MERGE_KEY = 'os_img_capi_merge_v1';
        function _mergeCapiBase() {
            try { if (localStorage.getItem(CAPI_MERGE_KEY)) return; } catch (e) { return; }
            const M = _IM();
            if (!M || !M.USES) return;
            const styles = M.getStyles();
            const findSame = (name, pos) => styles.find(s => s.name === name && String(s.pos || '').trim() === String(pos || '').trim());
            let added = 0;
            _capiPacks().forEach(p => {
                const text = String(p.text || '').trim();
                if (!text || findSame(p.name, text)) return;
                styles.push({ id: 'capipack_' + p.id, name: p.name, pos: text, neg: '', ref: '' });
                added++;
            });
            const base = String(((M.config && M.config.customApi) || {}).basePrompt || '').trim();
            const lost = [], moved = [];
            let baseStyle = null;
            if (base) {
                baseStyle = findSame('自訂接口原本的底詞', base);
                if (!baseStyle) { baseStyle = { id: 'capibase_' + Date.now().toString(36), name: '自訂接口原本的底詞', pos: base, neg: '', ref: '' }; styles.push(baseStyle); added++; }
            }
            if (added && !M.setStyles(styles)) return;   // 存不進去就整個不動，下次再試
            if (baseStyle) {
                const routes = M.getRoutes();
                M.USES.forEach(u => {
                    if (M.serviceForUse(u.id) !== 'custom_api') return;
                    const r = routes[u.id] || {};
                    if (!r.style || r.style === 'none') { M.setRoute(u.id, { style: baseStyle.id }); moved.push(u.name); }
                    else { const s = styles.find(x => x.id === r.style); lost.push(u.name + (s ? '（畫風「' + s.name + '」）' : '')); }
                });
                try {
                    const G = (window.parent || window).OS_ROOM_GEN || window.OS_ROOM_GEN;
                    if (G && G.getRoute && G.setRoute) { const rr = G.getRoute(); if (rr.mode !== 'comfy' && !rr.style) { G.setRoute({ style: baseStyle.id }); moved.push('房間'); } }
                } catch (e) {}
                // 底詞格清空：引擎跟設定頁兩份都要寫（底部保存照 imgConfig 重組）
                try {
                    M.config.customApi = Object.assign({}, M.config.customApi || {}, { basePrompt: '' });
                    if (imgConfig.customApi) imgConfig.customApi.basePrompt = '';
                    const saved = JSON.parse(localStorage.getItem(IMG_STORAGE_KEY) || '{}');
                    saved.customApi = Object.assign({}, saved.customApi || {}, { basePrompt: '' });
                    if (!_lsSet(IMG_STORAGE_KEY, JSON.stringify(saved), '圖片設定')) return;
                } catch (e) { return; }
            }
            _lsSet(CAPI_MERGE_KEY, String(Date.now()), '底詞包併進畫風');
            if (!added && !moved.length && !lost.length) return;
            let msg = '「自訂接口」那頁的底詞包和底詞格，併進「我的畫風」了，現在只有一份清單。';
            if (added) msg += '\n\n多了 ' + added + ' 包畫風（從底詞包和底詞格轉過來的）。';
            if (moved.length) msg += '\n\n這幾個地方改用「自訂接口原本的底詞」那包，底詞格那段字照樣會帶上（以前接在提示詞後面，現在放在最前面）：\n' + moved.map(x => '・' + x).join('\n');
            if (lost.length) msg += '\n\n這幾個地方本來就選了別的畫風，以前會再多接一段底詞格的字，現在只剩它選的那包：\n' + lost.map(x => '・' + x).join('\n')
                + '\n要的話，到「自訂接口」那頁改那包畫風，把字加進去。';
            const A = (window.parent || window).AUI || window.AUI;
            if (A && A.alert) A.alert(msg); else console.warn('[圖片設置] ' + msg);
            try { _renderImgUses(); _renderImgStyles(); } catch (e) {}
        }
        // 🔔 2026-11-17 改版：NAI、ComfyUI 的列不再疊畫風（含原本的頭像／背景／物品底詞）。
        //    第一次打開畫風頁時，把「改版前有疊、改版後不疊了」的列列給她看一次，要留的詞她自己貼進那個預設包。
        const STYLE_SPLIT_KEY = 'os_img_style_split_v1';
        function _imgStyleSplitNotice() {
            try { if (localStorage.getItem(STYLE_SPLIT_KEY)) return; } catch (e) { return; }
            const M = _IM();
            if (!M || !M.USES) return;
            const routes = M.getRoutes(), styles = M.getStyles(), lines = [], gone = [];
            // 原本走 Pollinations 的列（列上選的、或沒選過但它那一桶是 Pollinations）：現在是「還沒選」，要她重選接口。
            //   引擎載入時已經把桶裡的 Pollinations 換成空的，所以這裡看存檔原文
            let rawCfg = {};
            try { rawCfg = JSON.parse(localStorage.getItem('os_image_config') || '{}') || {}; } catch (e) {}
            const rawBucket = (type) => type === 'char' ? (rawCfg.serviceChar || rawCfg.serviceLiving || rawCfg.service)
                : type === 'scene' ? (rawCfg.serviceScene || rawCfg.serviceLiving || rawCfg.service)
                : type === 'map' ? (rawCfg.serviceMap || rawCfg.serviceInanimate || rawCfg.service)
                : (rawCfg.serviceInanimate || rawCfg.service);
            M.USES.forEach(u => {
                const r0 = routes[u.id] || {};
                if (r0.conn === 'poll' || (!r0.conn && rawBucket(u.type) === 'pollinations')) {
                    gone.push('・' + u.name);
                    if (r0.conn === 'poll') M.setRoute(u.id, { conn: '' });
                }
            });
            M.USES.forEach(u => {
                const svc = M.serviceForUse(u.id);
                if (svc !== 'novelai' && svc !== 'comfyui_direct') return;
                const r = routes[u.id] || {};
                let was = '';
                if (r.style && r.style !== 'none') { const s = styles.find(x => x.id === r.style); if (s) was = '畫風「' + s.name + '」'; }
                else if (!r.style && LEGACY_STYLE[u.id]) was = LEGACY_STYLE[u.id];
                if (was) lines.push('・' + u.name + '（' + (SVC_DISP[svc] || svc) + '）：' + was);
            });
            _lsSet(STYLE_SPLIT_KEY, String(Date.now()), '圖片設置改版提示');
            if (gone.length) _renderImgUses();
            if (!lines.length && !gone.length) return;
            const A = (window.parent || window).AUI || window.AUI;
            let msg = '';
            if (gone.length) msg += 'Pollinations 拿掉了。下面這幾個地方原本走它，現在是「還沒選」，要在這頁重選一個接口，不然不會出圖：\n\n' + gone.join('\n');
            if (lines.length) msg += (msg ? '\n\n' : '') + '畫風現在只給自訂接口用。NAI、ComfyUI 的長相寫在它們自己的預設包裡，下面這幾個地方原本多疊的那層詞，從現在起不再加上去：\n\n'
                + lines.join('\n')
                + '\n\n要留的話，把那段詞貼進那個預設包的底詞。';
            msg += '\n\n「我的畫風」搬到「自訂接口」那頁了。';
            if (A && A.alert) A.alert(msg); else console.warn('[圖片設置] ' + msg);
        }
        // 哪些地方用這包（選了自訂接口的列＋房間；房間自己存在 aurelia_room_route）
        function _styleUsedBy(id) {
            const M = _IM(); if (!M) return [];
            const routes = M.getRoutes();
            const out = M.USES.filter(u => (routes[u.id] || {}).style === id && M.serviceForUse(u.id) === 'custom_api').map(u => u.name);
            try { const G = (window.parent || window).OS_ROOM_GEN || window.OS_ROOM_GEN; if (G && G.getRoute && G.getRoute().mode !== 'comfy' && G.getRoute().style === id) out.push('房間'); } catch (e) {}
            return out;
        }
        // 編輯畫風的小視窗（avl-＝以前「角色外觀登記表」那個小窗的樣子，表已搬到角色中心，樣式留給這裡用）
        function _openStyleEditor(style) {
            return new Promise(resolve => {
                const s = Object.assign({ name: '', pos: '', neg: '', ref: '' }, style || {});
                let refFile = null, refCleared = false;
                const wrap = document.createElement('div');
                wrap.className = 'avl-modal img-style-modal';
                wrap.innerHTML = '<div class="avl-card">'
                    + '<div class="avl-title"><i class="fa-solid fa-palette"></i> ' + (style ? '修改畫風' : '新增畫風') + '</div>'
                    + '<div class="set-label">名字</div><input class="avl-name-input img-style-f-name" value="' + _ie(s.name) + '">'
                    + '<div class="set-label">底詞</div><textarea class="avl-prompt img-style-f-pos" rows="4">' + _ie(s.pos) + '</textarea>'
                    + '<div class="set-label">負詞</div><textarea class="avl-prompt img-style-f-neg" rows="3">' + _ie(s.neg) + '</textarea>'
                    + '<div class="set-label">底圖' + _ihelp('ss_img_style_ref') + '</div>'
                    + '<div class="img-style-ref-row"><div class="img-style-thumb img-style-f-thumb"></div>'
                    + '<button class="avl-btn img-style-f-pick" type="button"><i class="fa-solid fa-image"></i> 選一張</button>'
                    + '<button class="avl-btn img-style-f-clear" type="button"><i class="fa-solid fa-xmark"></i> 拿掉</button>'
                    + '<input type="file" accept="image/*" class="img-style-f-file" hidden></div>'
                    + '<div class="avl-actions"><span></span><span class="img-style-f-btns">'
                    + '<button class="avl-btn img-style-f-cancel" type="button">取消</button> '
                    + '<button class="avl-btn primary img-style-f-save" type="button">存好</button></span></div>'
                    + '</div>';
                (document.querySelector('.os-settings-root') || document.body).appendChild(wrap);
                const q = (c) => wrap.querySelector(c);
                const thumb = q('.img-style-f-thumb');
                const D = _dbw();
                if (s.ref && D && D.getImage) D.getImage(s.ref).then(u => { if (u) thumb.style.backgroundImage = "url('" + u + "')"; }).catch(() => {});
                q('.img-style-f-pick').onclick = () => q('.img-style-f-file').click();
                q('.img-style-f-file').onchange = () => {
                    const f = q('.img-style-f-file').files && q('.img-style-f-file').files[0];
                    if (!f) return;
                    refFile = f; refCleared = false;
                    thumb.style.backgroundImage = "url('" + URL.createObjectURL(f) + "')";
                };
                q('.img-style-f-clear').onclick = () => { refFile = null; refCleared = true; thumb.style.backgroundImage = ''; };
                const close = (v) => { wrap.remove(); resolve(v); };
                q('.img-style-f-cancel').onclick = () => close(null);
                q('.img-style-f-save').onclick = () => {
                    const name = q('.img-style-f-name').value.trim();
                    if (!name) { q('.img-style-f-name').focus({ preventScroll: true }); return; }
                    close({ name: name, pos: q('.img-style-f-pos').value.trim(), neg: q('.img-style-f-neg').value.trim(), refFile: refFile, refCleared: refCleared });
                };
            });
        }
        window._imgStyle = {
            async add() {
                const M = _IM(); if (!M) return;
                const v = await _openStyleEditor(null);
                if (!v) return;
                const id = 'st_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
                let ref = '';
                if (v.refFile && _dbw() && _dbw().saveImage) { try { ref = await _dbw().saveImage(STYLE_IMG_PREFIX + id, v.refFile); } catch (e) { AUI.toastr.warning('底圖存不進去：' + ((e && e.message) || e)); } }
                if (!M.setStyles(M.getStyles().concat([{ id: id, name: v.name, pos: v.pos, neg: v.neg, ref: ref }]))) {
                    // 清單沒存成（已經跳過提示了）：剛存的底圖沒有人指著，順手拿掉
                    if (ref && _dbw() && _dbw().deleteCharImage) { try { await _dbw().deleteCharImage(ref); } catch (e) {} }
                    return;
                }
                _renderImgStyles(); _renderImgUses(); _renderRoomBlock();
            },
            async edit(id) {
                const M = _IM(); if (!M) return;
                const list = M.getStyles();
                const cur = list.find(x => x.id === id);
                if (!cur) return;
                const v = await _openStyleEditor(cur);
                if (!v) return;
                let ref = cur.ref || '';
                if (v.refFile && _dbw() && _dbw().saveImage) { try { ref = await _dbw().saveImage(STYLE_IMG_PREFIX + id, v.refFile); } catch (e) { AUI.toastr.warning('底圖存不進去：' + ((e && e.message) || e)); } }
                else if (v.refCleared) { if (ref && _dbw() && _dbw().deleteCharImage) { try { await _dbw().deleteCharImage(ref); } catch (e) {} } ref = ''; }
                M.setStyles(list.map(x => x.id === id ? { id: id, name: v.name, pos: v.pos, neg: v.neg, ref: ref } : x));
                _renderImgStyles(); _renderImgUses(); _renderRoomBlock();
            },
            async del(id) {
                const M = _IM(); if (!M) return;
                const list = M.getStyles();
                const cur = list.find(x => x.id === id);
                if (!cur) return;
                const routes = M.getRoutes();
                const used = _styleUsedBy(id);
                if (!(await AUI.confirm('刪掉畫風「' + cur.name + '」？' + (used.length ? '\n用它的地方（' + used.join('、') + '）會改成不加畫風。' : ''), { danger: true }))) return;
                // 先把清單存掉：沒存成（已經跳過提示了）就什麼都別動，不然清單還指著一張已經刪掉的底圖
                if (!M.setStyles(list.filter(x => x.id !== id))) return;
                try { const G = (window.parent || window).OS_ROOM_GEN || window.OS_ROOM_GEN; if (G && G.getRoute && G.getRoute().style === id) G.setRoute({ style: '' }); } catch (e) {}
                if (cur.ref && _dbw() && _dbw().deleteCharImage) { try { await _dbw().deleteCharImage(cur.ref); } catch (e) {} }
                M.USES.forEach(u => { if ((routes[u.id] || {}).style === id) M.setRoute(u.id, { style: '' }); });
                _renderImgStyles(); _renderImgUses(); _renderRoomBlock();
            },
        };

        // ── 房間：照舊自己一塊（接口有三種走法，擠不進一列）；畫風改用「我的畫風」同一份 ──
        function _renderRoomBlock() {
            const box = container.querySelector('#img-room-style-block');
            const _w = window.parent || window;
            const G = _w.OS_ROOM_GEN || window.OS_ROOM_GEN;
            const M = _IM();
            if (!box || !G || !G.getRoute) return;
            const r = G.getRoute();
            const nodes = G.listCapiNodes ? G.listCapiNodes() : [];
            const opts = (cur) => nodes.map(n => '<option value="' + _ie(n.id) + '"' + (n.id === cur ? ' selected' : '') + '>' + _ie(n.name) + '</option>').join('');
            const hide = (modes) => (modes.split(' ').indexOf(r.mode) >= 0 ? '' : ' hidden');
            const packs = G.listStylePresets ? G.listStylePresets() : [];
            const packCur = G.getStyleName ? G.getStyleName() : '';
            const packOpts = packs.length
                ? packs.map(p => { const nm = String((p && p.name) || '未命名'); return '<option value="' + _ie(nm) + '"' + (nm === packCur ? ' selected' : '') + '>' + _ie(nm) + '</option>'; }).join('')
                : '<option value="">還沒有能畫房間的 ComfyUI 組合</option>';
            const styles = M ? M.getStyles() : [];
            box.innerHTML = '<div class="set-label"><i class="fa-solid fa-house"></i> 房間' + _ihelp('ss_room_route') + '</div>'
                + '<select class="set-select" id="img-room-route" onchange="window._saveRoomRoute && window._saveRoomRoute(); window._roomRouteShow && window._roomRouteShow()">'
                + '<option value="comfy"' + (r.mode === 'comfy' ? ' selected' : '') + '>ComfyUI</option>'
                + '<option value="capi1"' + (r.mode === 'capi1' ? ' selected' : '') + '>自訂接口・一次（只畫房間，家具不擋路）</option>'
                + '<option value="capi"' + (r.mode === 'capi' ? ' selected' : '') + '>自訂接口・兩次（自動量家具，家具會擋路）</option>'
                + '</select>'
                + '<div data-room-for="comfy"' + hide('comfy') + '><div class="set-label">用哪組' + _ihelp('ss_1589') + '</div>'
                + '<select class="set-select" id="img-room-comfy-style" onchange="((window.parent||window).OS_ROOM_GEN||window.OS_ROOM_GEN||{}).setStyleName && ((window.parent||window).OS_ROOM_GEN||window.OS_ROOM_GEN).setStyleName(this.value)">' + packOpts + '</select></div>'
                + '<div data-room-for="capi1 capi"' + hide('capi1 capi') + '><div class="set-label">畫房間用</div>'
                + '<select class="set-select" id="img-room-node" onchange="window._saveRoomRoute && window._saveRoomRoute()">' + opts(r.roomNode) + '</select></div>'
                + '<div data-room-for="capi"' + hide('capi') + '><div class="set-label">量家具用</div>'
                + '<select class="set-select" id="img-room-mask-node" onchange="window._saveRoomRoute && window._saveRoomRoute()">' + opts(r.maskNode) + '</select></div>'
                + '<div data-room-for="capi1 capi"' + hide('capi1 capi') + '><div class="set-label">畫風</div>'
                + '<select class="set-select" id="img-room-capi-style" onchange="window._saveRoomRoute && window._saveRoomRoute()">'
                + '<option value=""' + (r.style ? '' : ' selected') + '>照自訂接口的底詞</option>'
                + styles.map(x => '<option value="' + _ie(x.id) + '"' + (x.id === r.style ? ' selected' : '') + '>' + _ie(x.name) + '</option>').join('')
                + '</select></div>';
        }
        window._saveRoomRoute = () => {
            setTimeout(() => _renderImgStyles(), 0);   // 「用在」那行要把房間算進去
            const _w = window.parent || window;
            const G = _w.OS_ROOM_GEN || window.OS_ROOM_GEN;
            if (!G || !G.setRoute) return;
            const v = (id) => { const el = container.querySelector('#' + id); return el ? el.value : ''; };
            const m = v('img-room-route');
            G.setRoute({ mode: (m === 'capi' || m === 'capi1') ? m : 'comfy', roomNode: v('img-room-node'), maskNode: v('img-room-mask-node'), style: v('img-room-capi-style') });
        };
        window._roomRouteShow = () => {
            const sel = container.querySelector('#img-room-route');
            if (!sel) return;
            container.querySelectorAll('#img-room-style-block [data-room-for]').forEach(el => { el.hidden = String(el.getAttribute('data-room-for')).split(' ').indexOf(sel.value) < 0; });
        };

        // 🎴 一次生三種：勾了才攤開提示詞那格；提示詞打了就存，跟預設一樣（或清空）就不存——以後預設改了才跟得上
        //   兩格：svc 傳 'custom_api'＝自訂接口那格（#trio-tpl-gpt），其他＝原本那格（#trio-tpl）。key 和預設都問 VN_Image（trioTplKey／trioTplDef）
        const _trioVI = () => (window.parent || window).VN_Image || window.VN_Image;
        const _trioDefault = (svc) => { const VI = _trioVI(); return (VI && VI.trioTplDef && VI.trioTplDef(svc)) || ''; };
        const _trioKey = (svc) => { const VI = _trioVI(); return (VI && VI.trioTplKey) ? VI.trioTplKey(svc) : 'os_trio_tpl'; };
        const _trioBox = (svc) => container.querySelector(svc === 'custom_api' ? '#trio-tpl-gpt' : '#trio-tpl');
        // 三種一起生只在立繪模式下有作用：勾三種＝順便勾「跳過頭像」；取消「跳過頭像」＝三種也一起取消，兩格不會對不上
        //   （10-15 她：「我只勾一次生三種，他回給我的只有頭像，是不是因為還得開跳過頭像勾勾?」）
        window._trioToggle = (on) => {
            const b = container.querySelector('#vncfg-trio-body'); if (b) b.classList.toggle('hidden', !on);
            const sd = container.querySelector('#vncfg-sprite-direct'); if (on && sd) sd.checked = true;
        };
        container.querySelector('#vncfg-sprite-direct')?.addEventListener('change', (e) => {
            const tr = container.querySelector('#vncfg-sprite-trio');
            if (!e.target.checked && tr && tr.checked) { tr.checked = false; window._trioToggle(false); }
        });
        window._trioTplSave = (v, svc) => {
            const _w = window.parent || window;
            try {
                if (!String(v || '').trim() || v === _trioDefault(svc)) _w.localStorage.removeItem(_trioKey(svc));
                else _lsSet(_trioKey(svc), v, '一次生三種的提示詞');
            } catch (e) {}
        };
        window._trioTplReset = (svc) => {
            const _w = window.parent || window;
            try { _w.localStorage.removeItem(_trioKey(svc)); } catch (e) {}
            const ta = _trioBox(svc);
            if (ta) ta.value = _trioDefault(svc);
        };
        (function () {
            try { const VI = _trioVI(); if (VI && VI.trioTplMigrate) VI.trioTplMigrate(); } catch (e) {}   // 以前只有一格：寫了三面的那段先搬去自訂接口那格
            ['custom_api', ''].forEach((svc) => {
                const ta = _trioBox(svc);
                if (!ta) return;
                let v = null;
                try { v = (window.parent || window).localStorage.getItem(_trioKey(svc)); } catch (e) {}
                ta.value = (v && v.trim()) ? v : _trioDefault(svc);
            });
        })();

        // 🚪 世界門旅人：值＝「接口|預設包key」，選了就存（同房間的作風）
        window._saveWgSpritePack = (v) => {
            const _w = window.parent || window;
            try {
                const i = String(v || '').indexOf('|');
                const o = (i > 0) ? { src: String(v).slice(0, i), key: String(v).slice(i + 1) } : {};
                _lsSet('wg_sprite_pack_v1', JSON.stringify(o), '世界門旅人畫風');
            } catch (e) {}
        };

        // 🧸 不倒翁小人的提示詞（接自訂接口時用）：打了就存，跟預設一樣（或清空）就不存——以後預設改了才跟得上（同一次生三種那兩格）
        const _dollLD = () => { const _w = window.parent || window; return _w.LobbyDress || window.LobbyDress; };
        window._dollTplSave = (v) => {
            const LD = _dollLD();
            if (!LD || !LD.DOLL_TPL_KEY) return;
            try {
                if (!String(v || '').trim() || v === LD.DOLL_TPL) (window.parent || window).localStorage.removeItem(LD.DOLL_TPL_KEY);
                else _lsSet(LD.DOLL_TPL_KEY, v, '不倒翁小人的提示詞');
            } catch (e) {}
        };
        window._dollTplReset = () => {
            const LD = _dollLD();
            if (!LD || !LD.DOLL_TPL_KEY) return;
            try { (window.parent || window).localStorage.removeItem(LD.DOLL_TPL_KEY); } catch (e) {}
            const ta = container.querySelector('#doll-tpl');
            if (ta) ta.value = LD.DOLL_TPL;
        };
        (function () {
            const LD = _dollLD(), ta = container.querySelector('#doll-tpl');
            if (!ta || !LD || !LD.dollTpl) return;
            ta.value = LD.dollTpl();
        })();

        // 🎭 大廳的小人：值＝「接口|預設包key」，選了就存（存在裝扮室那把鑰匙裡，LobbyDress.setPack）
        window._saveDressPack = (kind, v) => {
            const _w = window.parent || window;
            const LD = _w.LobbyDress || window.LobbyDress;
            try { if (LD && LD.setPack) LD.setPack(kind, v); } catch (e) {}
        };

        // ── 🔁 第一次打開新版：把目前每個地方實際在用的設定轉成列的值，出圖不變 ──
        //   ① ComfyUI 的四個桶各存成一組「○○原本的設定」（跟現有組合一模一樣就指過去，不另存）
        //   ② 原本的頭像／背景／物品底詞各存成一包畫風
        //   ③ 房間原本自己那份畫風併進「我的畫風」
        //   ④ 每一列照原本的接口與底詞填好
        //   只跑一次（os_img_routes_migrated）；她已經改過的列不動。
        // ComfyUI 的一個桶（凍住的舊設定）→ 一個看得到、改得到的包：一模一樣的包已經有就指過去（叫「○○原本的設定」的優先），
        //   沒有才另存一個。回 { name, created }。
        const _CFD_BUCKET_LBL = { char: '頭像', scene: '插圖', bg: '背景', map: '小地圖' };
        const _CFD_KEYS = ['modelType', 'model', 'vae', 'sampler', 'scheduler', 'steps', 'cfg', 'clipSkip', 'basePrompt', 'negPrompt', 'guidance', 'fluxClipL', 'fluxT5', 'fluxAe', 'animaClip', 'animaVae'];
        const _cfdSameAs = (a, b) => _CFD_KEYS.every(k => String(a[k] == null ? '' : a[k]) === String(b[k] == null ? '' : b[k]))
            && JSON.stringify((a.loras || []).filter(l => l && l.name)) === JSON.stringify((b.loras || []).filter(l => l && l.name))
            && String((a.workflowMode === 'custom' && a.customWorkflow) || '') === String(b.customWorkflow || '');
        const _cfdPresetForBucket = (M, b) => {
            const presets = _cfdList();
            const eff = M._comfyCfgFor(b);
            const own = _CFD_BUCKET_LBL[b] + '原本的設定';
            const hit = presets.find(p => p && p.name === own && _cfdSameAs(eff, p)) || presets.find(p => p && p.name && _cfdSameAs(eff, p));
            if (hit) return { name: hit.name, created: false };
            let name = own, n = 2;
            while (presets.some(p => p && p.name === name)) name = own + ' ' + (n++);
            const np = { name: name };
            _CFD_KEYS.forEach(k => { if (eff[k] !== undefined) np[k] = eff[k]; });
            np.loras = (eff.loras || []).slice();
            np.width = eff.width; np.height = eff.height;
            np.customWorkflow = (eff.workflowMode === 'custom') ? (eff.customWorkflow || '') : '';
            presets.push(np);
            return { name: name, created: true };
        };
        // 「照原本的」而原本是 ComfyUI 的列：那份舊設定凍住了、面板上哪裡都改不到（她插圖那列清不掉 LoRA 就是這個）
        //   → 換成「ComfyUI・目前的設定」＝ComfyUI 頁面板上存的那份，改面板按保存就跟著變。指到被刪掉的包的列也算。
        //   定案：「原本的設定」指的是面板當前保存的，不是某個預設包；要用包就直接選那個包。
        const _pinComfyLegacyRows = () => {
            const M = _IM();
            if (!M || !M.USES || !M._resolveConn) return;
            const routes = M.getRoutes();
            M.USES.forEach(u => {
                const c = (routes[u.id] || {}).conn;
                if (c && M._resolveConn(c)) return;
                if (M.legacyServiceOf(u.id) !== 'comfyui_direct') return;
                M.setRoute(u.id, { conn: 'comfy' });
            });
        };
        const _migrateImgRoutes = () => {
            const M = _IM();
            if (!M || !M.USES) return;
            try { if (localStorage.getItem('os_img_routes_migrated') === '1') return; } catch (e) { return; }
            const bucketPreset = {};   // 桶 → 組合名字
            // 只替原本真的走 ComfyUI 的列用到的桶建（插圖走 NAI 就不必替插圖桶建一組）
            const needBuckets = [];
            M.USES.forEach(u => { if (M.legacyServiceOf(u.id) === 'comfyui_direct') { const bk = M._comfyBucketOf((M.useOf(u.id) || {}).type); if (needBuckets.indexOf(bk) < 0) needBuckets.push(bk); } });
            if (needBuckets.length) {
                needBuckets.forEach(b => { bucketPreset[b] = _cfdPresetForBucket(M, b).name; });
                _persistImgPresets();
            }
            // 畫風包
            const styles = M.getStyles();
            const mkStyle = (name, pos, neg) => {
                pos = String(pos || '').trim(); neg = String(neg || '').trim();
                if (!pos && !neg) return 'none';
                const hit = styles.find(s => s.pos === pos && s.neg === neg);
                if (hit) return hit.id;
                const id = 'st_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
                styles.push({ id: id, name: name, pos: pos, neg: neg, ref: '' });
                return id;
            };
            const avSvc = M.legacyServiceOf('avatar');
            const avTav = (avSvc === 'tavern_sd' || avSvc === 'comfyui_direct');
            const styleOf = {
                avatar: mkStyle('頭像原本的底詞', avTav ? vnD.avatarBasePromptTavern : vnD.avatarBasePrompt, avTav ? vnD.avatarNegPromptTavern : vnD.avatarNegPrompt),
                bg: mkStyle('背景原本的底詞', vnD.bgBasePrompt, vnD.bgNegPrompt),
                item: mkStyle('物品原本的底詞', (imgConfig.pollinations || {}).itemBasePrompt, (imgConfig.pollinations || {}).itemNegPrompt),
            };
            // 房間自己的畫風併過來
            const _w = window.parent || window;
            const G = _w.OS_ROOM_GEN || window.OS_ROOM_GEN;
            if (G && G.getRoute) {
                const rr = G.getRoute();
                let pick = '';
                (rr.styles || []).forEach(x => {
                    const id = mkStyle(x.name, x.prompt, '');
                    if (x.name === rr.style && id !== 'none') pick = id;
                });
                G.setRoute({ style: pick });
            }
            M.setStyles(styles);
            // 每一列
            const routes = M.getRoutes();
            const connOf = (use) => {
                const svc = M.legacyServiceOf(use);
                const t = (M.useOf(use) || {}).type;
                if (svc === 'comfyui_direct') { const nm = bucketPreset[M._comfyBucketOf(t)]; return nm ? 'comfy:' + nm : ''; }
                return { novelai: 'nai', custom_api: 'capi', tavern_sd: 'tavern' }[svc] || '';
            };
            M.USES.forEach(u => {
                const r = routes[u.id] || {};
                const patch = {};
                if (!r.conn) patch.conn = connOf(u.id);
                if (!r.style && styleOf[u.id]) patch.style = styleOf[u.id];
                if (Object.keys(patch).length) M.setRoute(u.id, patch);
            });
            _lsSet('os_img_routes_migrated', '1', '圖片設定');
            console.log('[圖片設置] 舊設定已轉成每個地方一列');
        };

        // ComfyUI 那支（wire）在下面才接上 → 等它接完再轉舊設定、畫第一次
        setTimeout(() => {
            try { _migrateImgRoutes(); } catch (e) { console.warn('[圖片設置] 轉舊設定失敗:', e); }
            try { _pinComfyLegacyRows(); } catch (e) { console.warn('[圖片設置] 照原本的列換成包失敗:', e); }
            try { window._cfdEdit && window._cfdEdit.refresh && window._cfdEdit.refresh(); } catch (e) {}
            if (mode !== 'album') { try { _mergeCapiBase(); } catch (e) { console.warn('[圖片設置] 底詞包併進畫風失敗:', e); } }
            window._switchImgTab(imgTab, true);   // 一開設置就畫好，但改版提示要等她真的點進圖片那頁才跳
            _refreshSpriteBatchNote();
            _fillTestUses();
            if (mode !== 'album') {
                const imgMainTab = container.querySelector('.set-tab[data-tab="img"]');
                if (imgMainTab) imgMainTab.addEventListener('click', () => { if (imgTab === 'style') _imgStyleSplitNotice(); });
            }
        }, 0);

        // ── 試畫一張：選一個地方，走真的分流 ──
        function _fillTestUses() {
            const sel = container.querySelector('#img-test-use');
            const M = _IM();
            if (!sel || !M || !M.USES) return;
            sel.innerHTML = M.USES.map(u => '<option value="' + u.id + '">' + _ie(u.name) + '</option>').join('');
        }
        // 這一列實際的尺寸（跟 vn_config 的 getAvatar／getSprite／getScene／getBg、各呼叫點寫死的那組一致）
        const _useSize = (use) => {
            const v = (sel) => (container.querySelector(sel) || {}).value || '';
            const parse = (raw) => { const m = String(raw || '').toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x').match(/^(\d{2,5})x(\d{2,5})$/); return m ? { width: +m[1], height: +m[2] } : {}; };
            if (use === 'avatar') return parse(v('#img-avatar-size'));
            if (use === 'sprite') return parse(localStorage.getItem('os_sprite_size') || '512x896');
            if (use === 'scene') { let raw = v('#img-scene-size') || '1024x1024'; if (raw === 'custom') raw = v('#img-scene-size-custom'); return parse(raw); }
            if (use === 'bg') return parse(v('#img-bg-size') || '1024x768');
            if (use === 'map') return { width: 1024, height: 512 };
            if (use === 'phone') return { width: 1024, height: 1024 };
            if (use === 'doll') return { width: 1536, height: 1024 };
            return { width: 512, height: 512 };
        };

        // ===== ComfyUI 直連設定：已拆到 os_settings_comfyui.js（參數注入 ctx＝閉包變數）=====
        //   模組發布 window._cfdPreset／_cfdEdit／_cfdGetPresets，
        //   HTML onclick 與下面存檔/測試呼叫點照舊不變。
        if (window.OS_SETTINGS_COMFY && window.OS_SETTINGS_COMFY.wire) {
            window.OS_SETTINGS_COMFY.wire({ imgConfig: imgConfig, container: container });
        } else {
            console.warn('[OS_SETTINGS] os_settings_comfyui.js 未載入，ComfyUI 直連設定停用');
        }

        // Fetch Logic (Primary)
        btnFetch.onclick = async () => {
            ((btnFetch.querySelector('i')) || btnFetch).style.animation = "spin 1s linear infinite";   // 只轉圖示，鈕上的字不轉
            status.innerText = "正在獲取模型列表...";
            
            try {
                if (elSystemApi.checked) {
                    const win = window.parent;
                    let foundModel = win.oai_settings?.openai_model || win.settings?.makersuite_model;
                    if (!foundModel) {
                        const domSelect = win.document.querySelector('#model_openai_select');
                        if (domSelect) foundModel = domSelect.value;
                    }
                    if (foundModel) {
                        elModel.innerHTML = `<option value="${_capiEsc(foundModel)}" selected>${_capiEsc(foundModel)}</option>`;
                        status.innerText = `已同步 (系統): ${foundModel}`;
                    } else {
                        throw new Error("無法讀取酒館模型");
                    }
                } 
                else {
                    const url = elUrl.value.trim();
                    const key = elKey.value.trim();
                    if (!url) throw new Error("請輸入 API 地址");
                    const _fmt = (container.querySelector('#os-api-format') || {}).value || 'openai';
                    const r = await _pullModels(elModel, url, key, _fmt);
                    status.innerText = r.st ? ST_NOTE(r.n) : `成功獲取 ${r.n} 個模型`;
                }
            } catch (e) {
                console.error(e);
                status.innerText = `同步失敗: ${e.message}` + TYPE_HINT;
            } finally {
                ((btnFetch.querySelector('i')) || btnFetch).style.animation = "none";   // 只轉圖示，鈕上的字不轉
                _withTypeOpt(elModel);
            }
        };

        // Fetch Logic (Secondary)
        secFetch.onclick = async () => {
            ((secFetch.querySelector('i')) || secFetch).style.animation = "spin 1s linear infinite";   // 只轉圖示，鈕上的字不轉
            status.innerText = "正在獲取副模型列表...";
            
            try {
                if (secSystemApi.checked) {
                    const win = window.parent;
                    let foundModel = win.oai_settings?.openai_model || win.settings?.makersuite_model;
                    if (!foundModel) {
                        const domSelect = win.document.querySelector('#model_openai_select');
                        if (domSelect) foundModel = domSelect.value;
                    }
                    if (foundModel) {
                        secModel.innerHTML = `<option value="${_capiEsc(foundModel)}" selected>${_capiEsc(foundModel)}</option>`;
                        status.innerText = `副模型已同步 (系統): ${foundModel}`;
                    } else {
                        throw new Error("無法讀取酒館模型");
                    }
                } 
                else {
                    // 🔥 自動根據同步拉桿決定取用哪組 URL/Key
                    const isSync = secSyncPrimary && secSyncPrimary.checked;
                    const url = isSync ? elUrl.value.trim() : secUrl.value.trim();  
                    const key = isSync ? elKey.value.trim() : secKey.value.trim();  
                    
                    if (!url) throw new Error("請輸入副模型 API 地址");
                    const _fmt = isSync ? ((container.querySelector('#os-api-format') || {}).value || 'openai') : ((container.querySelector('#sec-api-format') || {}).value || 'openai');
                    const r = await _pullModels(secModel, url, key, _fmt);
                    status.innerText = r.st ? '副模型：' + ST_NOTE(r.n) : `副模型列表更新成功 (${r.n})`;
                }

            } catch (e) {
                console.error(e);
                status.innerText = `副模型同步失敗: ${e.message}` + TYPE_HINT;
            } finally {
                ((secFetch.querySelector('i')) || secFetch).style.animation = "none";   // 只轉圖示，鈕上的字不轉
                _withTypeOpt(secModel);
            }
        };

        btnSave.onclick = () => {
            try {
                const layoutMode = container.querySelector('#os-layout-mode')?.value || 'auto';
                const _layoutOk = _lsSet('aurelia_layout_mode', layoutMode, '版面設定');   // 沒存成也照樣往下存其他的，最後不報「已保存」
                // ⚠️ 只在 PWA(獨立)版才套 iOS 安全區下移；酒館裡 ST 已處理過、再套會重複往下推 → 一律移除
                const isStandalone = !(window.parent || window).SillyTavern;
                const targetDocs = [document];
                if (window.parent && window.parent.document) targetDocs.push(window.parent.document);
                targetDocs.forEach(d => {
                    if (layoutMode === 'pad-ios' && isStandalone) {
                        d.body.classList.add('layout-pad-ios');
                    } else {
                        d.body.classList.remove('layout-pad-ios');
                    }
                });
                
                const header = container.querySelector('.set-header');
                if (header) {
                    if (layoutMode === 'pad-ios') {
                        header.style.setProperty('padding-top', '55px', 'important');
                    } else {
                        header.style.removeProperty('padding-top');
                    }
                }

                const llmData = {
                    useSystemApi: elSystemApi.checked,
                    stProfileId: elStProfile.value,
                    url: elUrl.value.trim(),
                    key: elKey.value.trim(),
                    model: elModel.value === MODEL_TYPE ? llmConfig.model : elModel.value,
                    usePresetPrompts: elUsePresetPrompts ? elUsePresetPrompts.checked : false,
                    presetName: (elPresetName ? elPresetName.value : '') || '',
                    maxTokens: parseInt(elMaxTokens.value),
                    temperature: parseFloat(elTemp.value),
                    top_p: parseFloat(elTopP.value),
                    frequency_penalty: parseFloat(elFreqPenalty.value),
                    presence_penalty: parseFloat(elPresPenalty.value),
                    enableThinking: elEnableThinking ? elEnableThinking.checked : false,
                    thinkingBudget: elThinkingBudget ? parseInt(elThinkingBudget.value) : 8000,
                    useGenerateRaw: elSystemApi.checked,   // 兩個旗標併成一個開關：用酒館連線＝走 🍎 那條乾淨 body
                    customCot: (elCustomCot ? elCustomCot.value : ''),
                    customCotMap: (function () { if (elCustomCot) _cotMap[_curCotKey] = elCustomCot.value; return _cotMap; })(),
                    apiFormat: (container.querySelector('#os-api-format') || {}).value || 'openai',
                    directMode: false, enableStreaming: false, disableTyping: false
                };

                // 🔥 自動根據同步拉桿，存儲對應的 URL/Key
                const isSecSync = secSyncPrimary ? secSyncPrimary.checked : false;
                const secLlmData = {
                    useSystemApi: secSystemApi.checked,
                    stProfileId: secStProfile.value,
                    syncWithPrimary: isSecSync,
                    url: isSecSync ? elUrl.value.trim() : secUrl.value.trim(),
                    key: isSecSync ? elKey.value.trim() : secKey.value.trim(),
                    model: secModel.value === MODEL_TYPE ? secLlmConfig.model : secModel.value,
                    usePresetPrompts: secUsePresetPrompts ? secUsePresetPrompts.checked : false,
                    presetName: (secPresetName ? secPresetName.value : '') || '',
                    maxTokens: parseInt(secMaxTokens.value),
                    temperature: parseFloat(secTemp.value),
                    top_p: parseFloat(secTopP.value),
                    frequency_penalty: parseFloat(secFreqPenalty.value),
                    presence_penalty: parseFloat(secPresPenalty.value),
                    useGenerateRaw: secSystemApi.checked,   // 同主模型：用酒館連線＝走 🍎 那條
                    customCot: container.querySelector('#sec-custom-cot')?.value || '',
                    apiFormat: isSecSync ? ((container.querySelector('#os-api-format') || {}).value || 'openai') : ((container.querySelector('#sec-api-format') || {}).value || 'openai'),
                    directMode: false, enableStreaming: false, disableTyping: false
                };

                // 桶的接口（serviceChar／serviceScene…）面板上已經沒有格子：每個地方改在「畫風」頁一列一列選（os_img_routes）。
                //   這幾個值照存檔原樣留著，給還沒改過的列當「照原本的」。
                const _imgCharSvc  = imgConfig.serviceChar || imgConfig.serviceLiving || imgConfig.service || '';
                // ComfyUI 頁面板上那一份＝目前的設定（跟 NAI 頁一樣）。🚨 這裡絕不寫回任何預設包——包只有「存回這個包」改得到。
                let _cfdPanel = {};
                try { _cfdPanel = (window._cfdEdit && window._cfdEdit.panelFields) ? window._cfdEdit.panelFields() : {}; } catch (e) {}
                const imgData = {
                    serviceInanimate: imgConfig.serviceInanimate || imgConfig.service || '',
                    serviceChar:      _imgCharSvc,
                    serviceScene:     imgConfig.serviceScene || _imgCharSvc,
                    serviceMap:       imgConfig.serviceMap || imgConfig.serviceInanimate || imgConfig.service || '',
                    serviceLiving:    _imgCharSvc,
                    service:          _imgCharSvc,
                    imgSourceSynced:  (typeof imgConfig.imgSourceSynced === 'boolean') ? imgConfig.imgSourceSynced : true,
                    customApi: {
                        url:    (container.querySelector('#img-capi-url')?.value   || '').trim(),
                        apiKey: (container.querySelector('#img-capi-key')?.value   || '').trim(),
                        model:  (container.querySelector('#img-capi-model')?.value || '').trim(),
                        quality: (container.querySelector('#img-capi-quality')?.value || 'medium'),
                        basePrompt: '',   // 底詞格 11-17 併進我的畫風了：畫風在每列自己選
                        refImages: !!container.querySelector('#img-capi-ref')?.checked,
                    },
                    novelai: {
                        token: elNaiToken.value.trim(),
                        url: (container.querySelector('#img-nai-url')?.value || '').trim(),
                        model: elNaiModel ? elNaiModel.value : 'nai-diffusion-3',
                        capFreeSize:   container.querySelector('#img-nai-cap-free')?.checked ?? true,
                        sampler:       (container.querySelector('#img-nai-sampler')?.value        || 'k_euler_ancestral'),
                        scale:         parseFloat(container.querySelector('#img-nai-scale')?.value  ?? 5),
                        steps:         parseInt(container.querySelector('#img-nai-steps')?.value    ?? 28),
                        ucPreset:      parseInt(container.querySelector('#img-nai-uc-preset')?.value ?? 1),
                        qualityToggle: container.querySelector('#img-nai-quality-toggle')?.checked ?? true,
                        smea:          container.querySelector('#img-nai-smea')?.checked ?? true,
                        smeaDyn:       container.querySelector('#img-nai-smea-dyn')?.checked ?? false,
                        charBasePrompt: (container.querySelector('#img-nai-char-base')?.value || '').trim(),
                        charNegPrompt:  (container.querySelector('#img-nai-char-neg')?.value  || '').trim(),
                        itemBasePrompt: (container.querySelector('#img-nai-item-base')?.value || '').trim(),
                        itemNegPrompt:  (container.querySelector('#img-nai-item-neg')?.value  || '').trim(),
                        naiPresets: naiPresets,
                        vibes: naiVibes,
                        vibeScope: {
                            char:  container.querySelector('#img-nai-vibe-sc-char')?.checked  ?? false,
                            scene: container.querySelector('#img-nai-vibe-sc-scene')?.checked ?? true,
                            bg:    container.querySelector('#img-nai-vibe-sc-bg')?.checked    ?? true,
                        },
                    },
                    // ComfyUI：扁平參數＝目前的設定，收面板上那一份；組合庫照記憶體裡那份原樣帶回（不從面板改）。
                    //   四個桶照存檔原樣留著（給沒選過的舊列當底）。
                    comfyuiDirect: Object.assign({}, imgConfig.comfyuiDirect || {}, _cfdPanel, {
                        url:       (container.querySelector('#img-cfd-url')?.value || '').trim(),
                        presets:   (window._cfdGetPresets ? window._cfdGetPresets() : ((imgConfig.comfyuiDirect && imgConfig.comfyuiDirect.presets) || [])),
                        previewPrompt: (container.querySelector('#img-cfd-preview-prompt')?.value || '').trim(),
                        sceneHires:        container.querySelector('#img-cfd-scene-hires')?.checked ?? true,
                        sceneHiresScale:   parseFloat(container.querySelector('#img-cfd-scene-hires-scale')?.value || 1.5) || 1.5,
                        sceneFaceDetailer: container.querySelector('#img-cfd-scene-facedetailer')?.checked ?? true,
                    }),
                    sceneGen: {
                        size:             (() => { const _sz = container.querySelector('#img-scene-size'); if (_sz?.value === 'custom') { const _c = (container.querySelector('#img-scene-size-custom')?.value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x'); return /^\d{2,5}x\d{2,5}$/.test(_c) ? _c : '1024x1024'; } return _sz?.value || '1024x1024'; })(),
                        sceneBasePrompt: (container.querySelector('#img-scene-base-prompt')?.value || '').trim(),
                        sceneNegPrompt:  (container.querySelector('#img-scene-neg-prompt')?.value  || '').trim(),
                        extractEnabled:   container.querySelector('#img-scene-extract-enabled')?.checked ?? false,
                        useNamePlaceholder: container.querySelector('#img-scene-name-placeholder')?.checked ?? true,   // 🏷️ 角色名佔位（預設開）
                        standaloneEnabled: container.querySelector('#img-scene-standalone-enabled')?.checked ?? false,   // 🎯 獨立插圖副模型
                        // 插圖指令／獨立插圖規範在自己的整頁（_openScenePromptPage）改、當場存，畫面上已經沒有那幾格：
                        //   這裡照記憶體裡那份帶回去。🚨 別改回讀畫面——讀不到就會整份存成空的。
                        standaloneSpec:            String(imgConfig.sceneGen?.standaloneSpec || ''),
                        extractPromptNovelai:      String(imgConfig.sceneGen?.extractPromptNovelai || '').trim(),
                        extractPromptTavern:       String(imgConfig.sceneGen?.extractPromptTavern || '').trim(),
                        extractPromptComfy:        String(imgConfig.sceneGen?.extractPromptComfy || '').trim(),
                        extractPromptCustom:       String(imgConfig.sceneGen?.extractPromptCustom || '').trim(),
                    },
                    pixabayKey:    (container.querySelector('#img-pixabay-key')?.value || '').trim(),
                    fallbackForce:  container.querySelector('#img-fallback-force')?.checked ?? false,
                    avatarSize:    (container.querySelector('#img-avatar-size')?.value || ''),
                    bgSize:        (container.querySelector('#img-bg-size')?.value || '1024x768')
                };

                const mmGroupId   = container.querySelector('#mm-group-id');
                const mmApiKey    = container.querySelector('#mm-api-key');
                const mmProvider  = container.querySelector('#mm-provider');
                const mmModel     = container.querySelector('#mm-speech-model');
                const mmEnabled   = container.querySelector('#mm-enabled');
                const mmSpeed     = container.querySelector('#mm-speed');
                const mmLangBoost = container.querySelector('#mm-lang-boost');
                // 角色配音名單（卡片在 os_settings_voice.js 畫）；Minimax 那幾位照舊抄一份進 voiceProfiles（AI 助手房間用）
                const castEntries = (window.OS_SETTINGS_VOICE && window.OS_SETTINGS_VOICE.collectCast) ? window.OS_SETTINGS_VOICE.collectCast(container) : [];
                const voiceProfiles = castEntries.filter(e => e.src === 'minimax').map(e => ({ label: e.label, id: e.voiceId, aliases: e.aliases.slice() }));
                const _mmPrev = ((window.parent || window).OS_MINIMAX && (window.parent || window).OS_MINIMAX.getConfig()) || {};
                const minimaxData = mmGroupId ? {
                    enabled:              mmEnabled  ? mmEnabled.checked        : false,
                    groupId:              mmGroupId.value.trim(),
                    apiKey:               mmApiKey   ? mmApiKey.value.trim()      : '',
                    provider:             mmProvider ? mmProvider.value          : 'cn',
                    speechModel:          mmModel    ? mmModel.value             : 'speech-02-turbo',
                    defaultSpeed:         mmSpeed    ? parseFloat(mmSpeed.value) : 1.0,
                    defaultLanguageBoost: mmLangBoost ? mmLangBoost.value        : '',
                    voiceProfiles,
                    myVoices:             Array.isArray(_mmPrev.myVoices) ? _mmPrev.myVoices : []   // 「抓我的聲音」存的，整份覆蓋時別弄丟
                } : null;

                let _saveOk = saveConfig(llmData, secLlmData, imgData, minimaxData) && _layoutOk;
                {
                    const VW = window.parent || window;
                    if (VW.OS_ELEVENLABS) _saveOk = !!VW.OS_ELEVENLABS.saveConfig({
                        apiKey:  (container.querySelector('#el-api-key')?.value || '').trim(),
                        modelId: container.querySelector('#el-model')?.value || 'eleven_v4'
                    }) && _saveOk;
                    if (VW.OS_VOICE_CAST) _saveOk = !!VW.OS_VOICE_CAST.saveRoster({ entries: castEntries }) && _saveOk;
                }
                // ComfyUI 頁的下拉選回「目前的設定」時讀的是這份 → 換成剛存的，不然會載回開面板時的舊值
                imgConfig.comfyuiDirect = imgData.comfyuiDirect;
                // 刪掉的 NAI 預設縮圖／Vibe：清單存進去了才從圖庫刪（沒按保存就離開的話，清單還在、圖也還在）
                //   空間滿了沒存進去也一樣：存檔裡的清單還指著那些圖，先別刪
                if (_saveOk) { try { window._naiFlushDeletes && window._naiFlushDeletes(); } catch (e) {} }

                // 換產圖器後：依新 service 自動翻頭像規則三條目的開關（VN 指令；只撥開關，不寫內容）
                try { (window.parent || window).OS_AVATAR_RULES_INJECTOR?.syncAvatarRuleEntries?.(); } catch (e) {}

                // ⛔ 這裡原本會整份覆寫 os_vector_config（只帶 6 個欄位）→ 每按一次保存就把
                //    📝 記憶面板才有的 embeddingLocal / localModel / extractSource / mainRecentOnly 清掉。
                //    記憶設定現在只由 📝 記憶（變數工坊→記憶）那一處管，它是讀舊值再逐欄覆蓋、不會互相蓋。

                // VN 設置由外部模組統一存入 vn_cfg_v4
                if (window.VN_SETTINGS_PANEL) window.VN_SETTINGS_PANEL.save(container);
                if (!_saveOk) { status.innerText = '有幾項沒存下來（本機空間滿了）'; return; }
                btnSave.innerText = "已保存 ✓";
                status.innerText = "設置已生效";
                setTimeout(() => { btnSave.innerText = "保存所有設定"; }, 2000);
            } catch (e) {
                console.error("保存失敗:", e);
                status.innerText = `保存失敗: ${e.message}`; 
            }
        };

        // --- Test API Logic (共用) ---
        async function runApiTest(cfg, modelVal, resultEl) {
            // 測試只說一句 Hi，但會先想的模型（Gemini 3.x pro、Claude 5.5、o 系列）想的部分也算在字數裡：
            //   以前給 50，一想就用光、回空的，測試看起來失敗、實際生成卻正常（11-13 小斐驗收 Vertex 3.1-pro 抓到）。給 2048 讓它想完
            const TEST_MAX = 2048;
            resultEl.style.display = 'block';
            resultEl.style.color = 'rgba(26,28,40,0.40)';
            resultEl.textContent = '測試中...';
            try {
                let replyText = '';
                const win = window.parent || window;
                const doc = win.document;

                if (cfg.useSystemApi) {
                    const context = win.SillyTavern?.getContext?.();
                    if (!context) throw new Error('無法取得 ST Context');

                    if (cfg.stProfileId) {
                        const profilesSelect = doc.getElementById('connection_profiles');
                        if (!profilesSelect) throw new Error('找不到 ST 連線設定選單 (#connection_profiles)');

                        const originalProfileId = profilesSelect.value;
                        const needSwitch = (originalProfileId !== cfg.stProfileId);

                        if (needSwitch) {
                            profilesSelect.value = cfg.stProfileId;
                            await new Promise((resolve, reject) => {
                                const timeout = setTimeout(() => reject(new Error('切換設定檔逾時 (10秒)')), 10000);
                                context.eventSource.once(context.eventTypes.CONNECTION_PROFILE_LOADED, () => {
                                    clearTimeout(timeout);
                                    resolve();
                                });
                                profilesSelect.dispatchEvent(new Event('change'));
                            });
                        }

                        let response;
                        try {
                            // 🚨測試要跟生成路徑送一樣的東西,不然會出現「測試失敗但實際能生成」：
                            //   ①強制不串流（免酒館串流開著時誤判失敗）
                            //   ②vertex 服務帳號要補 vertexai_auth_mode —— 酒館的 sendRequest 自己不帶,
                            //     後端就預設 express、跑去 API Key 那桶找金鑰 → 服務帳號永遠找不到。
                            let _ov = { stream: false };
                            try { _ov = win.OS_API?._vertexOverride?.(context, cfg.stProfileId, _ov) || _ov; } catch (e) {}
                            response = await context.ConnectionManagerRequestService.sendRequest(
                                cfg.stProfileId,
                                [{ role: 'user', content: 'Hi' }],
                                TEST_MAX,
                                undefined,
                                _ov
                            );
                        } finally {
                            if (needSwitch) {
                                profilesSelect.value = originalProfileId || '';
                                profilesSelect.dispatchEvent(new Event('change'));
                            }
                        }
                        replyText = response?.choices?.[0]?.message?.content || JSON.stringify(response);
                    } else {
                        const headers = context.getRequestHeaders();
                        // 沒選連接設定檔 → 直連組 body（不經 sendRequest）；同樣要擋掉 top_k=0，否則測試永遠 400
                        const _tbody = { messages: [{ role: 'user', content: 'Hi' }], max_tokens: TEST_MAX, stream: false };
                        try { win.OS_API?._dropZeroTopK?.(context, _tbody); } catch (e) {}
                        const res = await fetch('/api/backends/chat-completions/generate', {
                            method: 'POST',
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify(_tbody)
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const data = await res.json();
                        replyText = data?.choices?.[0]?.message?.content || data?.content || JSON.stringify(data);
                    }
                } else if (cfg.apiFormat === 'gemini' || cfg.apiFormat === 'anthropic') {
                    // 照「請求格式」送，網址與 body 跟 OS_API.chat 那兩條原生格式同一套（根網址、body 都直接借它的）：
                    //   以前一律打 /chat/completions，選了 Gemini／Claude 原生的站測試必失敗、實際卻能用
                    if (!cfg.url) throw new Error('請先填寫 API 地址');
                    const msgs = [{ role: 'user', content: 'Hi' }];
                    const base = win.OS_API.nativeBase(cfg.apiFormat, cfg.url);
                    let res;
                    if (cfg.apiFormat === 'gemini') {
                        const gUrl = win.OS_API.geminiGenUrl(cfg.url, modelVal, cfg.key);   // 跟送生成同一支（Vertex 的網址也在裡面分）
                        res = await fetch(gUrl, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(cfg.key || '') },
                            body: JSON.stringify(win.OS_TO_GEMINI_BODY(msgs, { maxTokens: TEST_MAX, vertex: win.OS_API.isVertexUrl(cfg.url) }))
                        });
                    } else {
                        const aUrl = base + '/v1/messages';
                        res = await fetch(aUrl, {
                            method: 'POST', headers: win.OS_API.authHeaders(aUrl, cfg.key, { json: true, anthropic: true }),
                            body: JSON.stringify(win.OS_TO_ANTHROPIC_BODY(msgs, { model: modelVal, maxTokens: TEST_MAX }))
                        });
                    }
                    const data = await res.json().catch(() => null);
                    if (!res.ok) throw new Error(win.OS_API.vertexHint(cfg.url, `HTTP ${res.status}: ` + ((data && data.error && (data.error.message || JSON.stringify(data.error))) || res.statusText)));
                    replyText = (cfg.apiFormat === 'gemini'
                        ? ((data?.candidates?.[0]?.content?.parts) || []).filter(p => p && !p.thought).map(p => p.text || '').join('')
                        : ((data?.content) || []).filter(b => b && b.type === 'text').map(b => b.text || '').join(''))
                        || JSON.stringify(data);
                } else {
                    if (!cfg.url) throw new Error('請先填寫 API 地址');
                    let targetUrl = cfg.url.replace(/\/$/, '');
                    if (!targetUrl.includes('/chat/completions')) targetUrl += (targetUrl.endsWith('/v1') ? '' : '/v1') + '/chat/completions';
                    const res = await fetch(targetUrl, {
                        method: 'POST',
                        headers: window.OS_API.authHeaders(targetUrl, cfg.key, { json: true }),
                        body: JSON.stringify({ model: modelVal, messages: [{ role: 'user', content: 'Hi' }], max_tokens: TEST_MAX, stream: false })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    const data = await res.json();
                    replyText = data?.choices?.[0]?.message?.content || data?.content || JSON.stringify(data);
                }

                resultEl.style.color = 'rgba(26,28,40,0.25)';
                resultEl.textContent = '回應: ' + replyText;
                status.innerText = 'API 連線成功';
            } catch (e) {
                // 酒館把所有失敗都包成 `API request failed`，真正的原因在 cause 裡 → 攤平顯示
                let _msg = e.message;
                try { _msg = (window.parent || window).OS_API?._causeText?.(e) || _msg; } catch (_) {}
                resultEl.style.color = '#fc8181';
                resultEl.textContent = '錯誤: ' + _msg;
                status.innerText = 'API 測試失敗';
            }
        }

        btnTest.onclick = async () => {
            btnTest.style.opacity = '0.5'; btnTest.textContent = '測試中...';
            await runApiTest(
                { useSystemApi: elSystemApi.checked, stProfileId: elStProfile.value, url: elUrl.value.trim(), key: elKey.value.trim(),
                  apiFormat: (container.querySelector('#os-api-format') || {}).value || 'openai' },
                elModel.value,
                container.querySelector('#os-test-result')
            );
            btnTest.style.opacity = '1'; btnTest.textContent = '發送測試訊息';
        };

        // 🔥 副模型測試：自動判斷是否使用同步的 URL/Key
        secTestBtn.onclick = async () => {
            secTestBtn.style.opacity = '0.5'; secTestBtn.textContent = '測試中...';
            const isSecSync = secSyncPrimary && secSyncPrimary.checked;
            const testUrl = isSecSync ? elUrl.value.trim() : secUrl.value.trim();
            const testKey = isSecSync ? elKey.value.trim() : secKey.value.trim();
            await runApiTest(
                { useSystemApi: secSystemApi.checked, stProfileId: secStProfile.value, url: testUrl, key: testKey,
                  // 同步主模型時格式跟主模型走（跟保存時一樣）
                  apiFormat: (container.querySelector(isSecSync ? '#os-api-format' : '#sec-api-format') || {}).value || 'openai' },
                secModel.value,
                container.querySelector('#sec-test-result')
            );
            secTestBtn.style.opacity = '1'; secTestBtn.textContent = '發送測試訊息';
        };


        // 本機那頁（vn_tts_panel inline）第一次切進「本機」小分頁才畫，見 os_settings_voice.js wireTabs
        // 旁白·系統選擇器：掛在「角色配音」那頁最下面（旁白/系統默認關閉）
        if (window.VN_TTS_Panel?.mountNarration) {
            setTimeout(() => window.VN_TTS_Panel.mountNarration('vn-narr-inline-root'), 100);
        }

        const mmSpeedSlider = container.querySelector('#mm-speed');
        const mmSpeedVal    = container.querySelector('#mm-speed-val');
        if (mmSpeedSlider) {
            mmSpeedSlider.oninput = () => {
                mmSpeedVal.textContent = parseFloat(mmSpeedSlider.value).toFixed(1);
            };
        }

        let naiPresets = [...(imgConfig.novelai.naiPresets || [])];
        // 🚨 刪預設／換縮圖／刪 Vibe 時圖先別從圖庫刪：清單要按「保存」才寫回，以前當下就刪，
        //    沒保存就離開的話清單項目還在，預覽和 Vibe 卻沒了。按保存時才真的刪（_naiFlushDeletes）
        const _naiDelQ = { thumbs: [], vibes: [] };
        window._naiFlushDeletes = async function () {
            const OSDB = (window.parent || window).OS_DB;
            const q = { thumbs: _naiDelQ.thumbs.splice(0), vibes: _naiDelQ.vibes.splice(0) };
            if (!OSDB) return;
            const liveT = new Set(naiPresets.map(p => p && p.thumbId).filter(Boolean));   // 還掛在清單上的不刪
            const liveV = new Set(naiVibes.map(v => v && v.id).filter(Boolean));
            for (const t of q.thumbs) { if (liveT.has(t)) continue; try { if (OSDB.deleteNaiThumb) await OSDB.deleteNaiThumb(t); } catch (e) {} }
            for (const v of q.vibes) { if (liveV.has(v)) continue; try { if (OSDB.deleteNaiVibe) await OSDB.deleteNaiVibe(v); } catch (e) {} }
        };
        // 拖圖預設用穩定 id 對應 IndexedDB 縮圖；舊預設（沒 id）補一個
        naiPresets.forEach(p => { if (p && !p.id) p.id = 'np_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); });

        function refreshNaiPresetDropdown() {
            const sel = container.querySelector('#img-nai-preset-sel');
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="">-- 選擇預設 --</option>' +
                naiPresets.map((p, i) => `<option value="${i}">${_capiEsc(p.name)}</option>`).join('');
            if (cur !== '' && naiPresets[parseInt(cur)]) sel.value = cur;
        }

        // ── NAI 拖圖預設包：helpers ──
        const naiEscAttr = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        function naiSuggestName(r, f) {
            const pp = (r && r.prompt) || '';
            const m = pp.match(/::\s*([^:,\n]+?)\s*::/);
            let base = m ? m[1] : ((pp.split(/[,\n]/).map(s => s.trim()).filter(Boolean)[0]) || '');
            base = base.replace(/^\d+(\.\d+)?::/, '').replace(/[{}\[\]]/g, '').trim();
            if (!base && f && f.name) base = f.name.replace(/\.[^.]+$/, '');
            return (base || 'NAI 預設').slice(0, 24);
        }
        function naiFileToThumb(file) {
            return new Promise(resolve => {
                createImageBitmap(file).then(bmp => {
                    const max = 256; let w = bmp.width, h = bmp.height;
                    if (w >= h) { if (w > max) { h = Math.round(h * max / w); w = max; } }
                    else { if (h > max) { w = Math.round(w * max / h); h = max; } }
                    const c = document.createElement('canvas'); c.width = w; c.height = h;
                    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
                    if (bmp.close) bmp.close();
                    resolve(c.toDataURL('image/jpeg', 0.72));
                }).catch(() => resolve(null));
            });
        }
        function naiNewId() { return 'np_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

        window._naiPreset = {
            apply() {
                const sel = container.querySelector('#img-nai-preset-sel');
                if (!sel || sel.value === '') { AUI.alert('請先選擇預設'); return; }
                const p = naiPresets[parseInt(sel.value)];
                if (!p) return;
                const set = (id, v) => { const el = container.querySelector(id); if (el) el.value = v; };
                set('#img-nai-char-base', p.charBasePrompt || '');
                set('#img-nai-char-neg',  p.charNegPrompt  || '');
                set('#img-nai-item-base', p.itemBasePrompt || '');
                set('#img-nai-item-neg',  p.itemNegPrompt  || '');
                if (p.sampler  !== undefined) set('#img-nai-sampler', p.sampler);
                if (p.scale    !== undefined) set('#img-nai-scale',   p.scale);
                if (p.steps    !== undefined) set('#img-nai-steps',   p.steps);
                if (p.ucPreset !== undefined) set('#img-nai-uc-preset', p.ucPreset);
            },
            save() {
                const row = container.querySelector('#img-nai-preset-name-row');
                if (row) row.style.display = 'block';
                container.querySelector('#img-nai-preset-name-input')?.focus({ preventScroll: true });
            },
            confirmSave() {
                const nameInput = container.querySelector('#img-nai-preset-name-input');
                const name = nameInput?.value.trim();
                if (!name) { AUI.alert('請輸入預設名稱'); return; }
                const get = id => (container.querySelector(id)?.value || '').trim();
                const getNum = (id, def) => parseFloat(container.querySelector(id)?.value ?? def);
                const getInt = (id, def) => parseInt(container.querySelector(id)?.value ?? def);
                naiPresets.push({
                    id: naiNewId(),
                    name,
                    charBasePrompt: get('#img-nai-char-base'),
                    charNegPrompt:  get('#img-nai-char-neg'),
                    itemBasePrompt: get('#img-nai-item-base'),
                    itemNegPrompt:  get('#img-nai-item-neg'),
                    sampler:   get('#img-nai-sampler') || 'k_euler_ancestral',
                    scale:     getNum('#img-nai-scale', 5),
                    steps:     getInt('#img-nai-steps', 28),
                    ucPreset:  getInt('#img-nai-uc-preset', 1),
                });
                refreshNaiPresetDropdown();
                const sel = container.querySelector('#img-nai-preset-sel');
                if (sel) sel.value = String(naiPresets.length - 1);
                const row = container.querySelector('#img-nai-preset-name-row');
                if (row) row.style.display = 'none';
                if (nameInput) nameInput.value = '';
            },
            cancelSave() {
                const row = container.querySelector('#img-nai-preset-name-row');
                if (row) row.style.display = 'none';
                const nameInput = container.querySelector('#img-nai-preset-name-input');
                if (nameInput) nameInput.value = '';
            },
            async del() {
                const sel = container.querySelector('#img-nai-preset-sel');
                if (!sel || sel.value === '') { AUI.alert('請先選擇要刪除的預設'); return; }
                const idx = parseInt(sel.value);
                const name = naiPresets[idx]?.name || '';
                if (!await AUI.confirm(`刪除預設「${name}」？`)) return;
                const tid = naiPresets[idx]?.thumbId;
                if (tid) _naiDelQ.thumbs.push(tid);
                naiPresets.splice(idx, 1);
                refreshNaiPresetDropdown();
                this.renderGrid();
            },

            // ── 匯出／匯入整包（含預覽圖）──縮圖存 IndexedDB，匯出時撈出來 inline 進 JSON，匯入時再寫回 DB。
            _sanitizeNaiPreset(p) {
                const s = v => (v == null) ? '' : String(v).trim();
                const num = (v, d) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
                const int = (v, d) => { const n = parseInt(v); return isNaN(n) ? d : n; };
                return {
                    name: s(p.name),
                    charBasePrompt: s(p.charBasePrompt), charNegPrompt: s(p.charNegPrompt),
                    itemBasePrompt: s(p.itemBasePrompt), itemNegPrompt: s(p.itemNegPrompt),
                    sampler: s(p.sampler) || 'k_euler_ancestral',
                    scale: num(p.scale, 5), steps: int(p.steps, 28), ucPreset: int(p.ucPreset, 1),
                    model: s(p.model),
                    preview: (typeof p.preview === 'string' && p.preview.indexOf('data:image') === 0) ? p.preview : ''
                };
            },
            async exportPack() {
                if (!naiPresets.length) { AUI.alert('還沒有預設可以匯出。'); return; }
                const OSDB = (window.parent || window).OS_DB;
                const out = [];
                for (const p of naiPresets) {
                    const o = {
                        name: p.name, charBasePrompt: p.charBasePrompt || '', charNegPrompt: p.charNegPrompt || '',
                        itemBasePrompt: p.itemBasePrompt || '', itemNegPrompt: p.itemNegPrompt || '',
                        sampler: p.sampler, scale: p.scale, steps: p.steps, ucPreset: p.ucPreset, model: p.model || '', preview: ''
                    };
                    if (p.thumbId && OSDB && OSDB.getNaiThumb) {
                        try { const b64 = await OSDB.getNaiThumb(p.thumbId); if (b64) o.preview = b64; } catch (e) {}
                    }
                    out.push(o);
                }
                const data = { type: 'aurelia_nai_presets', version: 1, presets: out };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const d = new Date();
                a.download = 'NAI提示詞預設_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            },
            importPack() {
                const fi = container.querySelector('#img-nai-pack-import-file');
                if (fi) { fi.value = ''; fi.click(); }
            },
            _importFile(file) {
                const self = this;
                const reader = new FileReader();
                reader.onload = function () {
                    try {
                        const j = JSON.parse(String(reader.result));
                        const arr = Array.isArray(j) ? j : (Array.isArray(j.presets) ? j.presets : null);
                        if (!arr || !arr.length) { AUI.alert('這個檔案裡找不到 NAI 預設，確認拿到的是 NAI 預設包檔（.json）。'); return; }
                        const clean = arr.filter(p => p && String(p.name || '').trim());
                        if (!clean.length) { AUI.alert('檔案裡的預設都沒有名稱，讀不進來。'); return; }
                        self._pendingImport = clean;
                        if (!naiPresets.length) { self._applyImport('append'); return; }   // 牆空→直接加、不問
                        const msg = container.querySelector('#img-nai-import-msg');
                        if (msg) msg.textContent = '讀到 ' + clean.length + ' 個預設。要怎麼放進現有的 ' + naiPresets.length + ' 個裡？';
                        const box = container.querySelector('#img-nai-import-choice');
                        if (box) box.style.display = 'block';
                    } catch (e) { AUI.alert('這個檔案讀不出來，確認是 NAI 預設包檔（.json）。'); }
                };
                reader.readAsText(file);
            },
            _cancelImport() {
                this._pendingImport = null;
                const box = container.querySelector('#img-nai-import-choice');
                if (box) box.style.display = 'none';
            },
            // mode='overwrite'：同名更新（順手刪舊縮圖）、其餘新增；mode='append'：全部新增（同名自動加序號）
            async _applyImport(mode) {
                const self = this;
                const arr = this._pendingImport;
                const box = container.querySelector('#img-nai-import-choice');
                if (box) box.style.display = 'none';
                if (!arr || !arr.length) { this._pendingImport = null; return; }
                const OSDB = (window.parent || window).OS_DB;
                const norm = s => String(s || '').trim();
                let added = 0, updated = 0;
                for (const raw of arr) {
                    const clean = self._sanitizeNaiPreset(raw);
                    const id = naiNewId();
                    let thumbId = '';
                    if (clean.preview && OSDB && OSDB.saveNaiThumb) {
                        try { await OSDB.saveNaiThumb(id, clean.preview); thumbId = id; } catch (e) {}
                    }
                    let nm = clean.name;
                    if (mode === 'append') {   // 同名加序號，兩份都留
                        let n = 2; while (naiPresets.some(x => norm(x.name) === norm(nm))) { nm = clean.name + ' ' + (n++); }
                    }
                    const entry = {
                        id, name: nm,
                        charBasePrompt: clean.charBasePrompt, charNegPrompt: clean.charNegPrompt,
                        itemBasePrompt: clean.itemBasePrompt, itemNegPrompt: clean.itemNegPrompt,
                        sampler: clean.sampler, scale: clean.scale, steps: clean.steps, ucPreset: clean.ucPreset,
                        model: clean.model, thumbId, fromImage: !!thumbId
                    };
                    if (mode === 'overwrite') {
                        const idx = naiPresets.findIndex(x => norm(x.name) === norm(clean.name));
                        if (idx >= 0) {
                            const oldTid = naiPresets[idx].thumbId;
                            if (oldTid && oldTid !== thumbId) _naiDelQ.thumbs.push(oldTid);
                            naiPresets[idx] = entry; updated++; continue;
                        }
                    }
                    naiPresets.push(entry); added++;
                }
                this._pendingImport = null;
                refreshNaiPresetDropdown();
                self.renderGrid();
                AUI.alert('匯入完成：新增 ' + added + ' 個' + (updated ? ('、覆蓋更新 ' + updated + ' 個') : '') + '。\n記得按底部「保存」才會存住。');
            },
            async clearAll() {
                if (!naiPresets.length) { AUI.alert('目前沒有 NAI 預設可以清空。'); return; }
                if (!await AUI.confirm('確定清空全部 ' + naiPresets.length + ' 個 NAI 預設？\n（要按底部「保存」後才真的生效）')) return;
                for (const p of naiPresets) { if (p.thumbId) _naiDelQ.thumbs.push(p.thumbId); }
                naiPresets.length = 0;
                refreshNaiPresetDropdown();
                this.renderGrid();
                const st = container.querySelector('#img-nai-pack-status');
                if (st) st.textContent = '已清空（記得按底部「保存」才會存住）';
            },

            // ── 拖圖預設包（卡片牆 + 縮圖預覽）──
            open() {
                const m = container.querySelector('#img-nai-pack-modal');
                if (m) m.classList.add('is-open');
                this._cancelImport();
                this._bindDrop();
                this.renderGrid();
            },
            close() {
                const m = container.querySelector('#img-nai-pack-modal');
                if (m) m.classList.remove('is-open');
            },
            _bindDrop() {
                if (this._dropBound) return;
                const drop = container.querySelector('#img-nai-pack-drop');
                const file = container.querySelector('#img-nai-pack-file');
                if (!drop) return;
                const self = this;
                drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-drag'); });
                drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
                drop.addEventListener('drop', e => {
                    e.preventDefault(); drop.classList.remove('is-drag');
                    if (e.dataTransfer && e.dataTransfer.files) self.handleFiles(e.dataTransfer.files);
                });
                if (file) file.addEventListener('change', e => { self.handleFiles(e.target.files); e.target.value = ''; });
                const impFile = container.querySelector('#img-nai-pack-import-file');
                if (impFile) impFile.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) self._importFile(f); e.target.value = ''; });
                this._dropBound = true;
            },
            async handleFiles(fileList) {
                const W = window.parent || window;
                const RECIPE = W.NAI_RECIPE, OSDB = W.OS_DB;
                const statusEl = container.querySelector('#img-nai-pack-status');
                const files = Array.from(fileList || []).filter(f => /image\//.test(f.type) || /\.(png|webp)$/i.test(f.name || ''));
                if (!files.length) return;
                if (!RECIPE || !RECIPE.parseFile) { if (statusEl) statusEl.textContent = '解析模組未就緒'; return; }
                let ok = 0, fail = 0;
                for (let fi = 0; fi < files.length; fi++) {
                    const f = files[fi];
                    if (statusEl) statusEl.textContent = `解析中 ${fi + 1}/${files.length}…`;
                    let res = null;
                    try { res = await RECIPE.parseFile(f); } catch (e) { res = null; }
                    if (!res || !res.ok) { fail++; continue; }
                    const r = res.recipe;
                    const id = naiNewId();
                    let thumbId = '';
                    try {
                        const thumb = await naiFileToThumb(f);
                        if (thumb && OSDB && OSDB.saveNaiThumb) { await OSDB.saveNaiThumb(id, thumb); thumbId = id; }
                    } catch (e) {}
                    naiPresets.push({
                        id, name: naiSuggestName(r, f),
                        charBasePrompt: r.prompt || '',
                        charNegPrompt:  r.neg || '',
                        itemBasePrompt: '', itemNegPrompt: '',
                        sampler: r.sampler || 'k_euler',
                        scale: (r.scale != null ? r.scale : 5),
                        steps: (r.steps != null ? r.steps : 28),
                        ucPreset: 1,
                        width: (r.width || undefined), height: (r.height || undefined),   // 原圖尺寸跟著包走（裝扮室生成等吃包的尺寸）
                        thumbId, fromImage: true, model: r.model || ''
                    });
                    ok++;
                }
                refreshNaiPresetDropdown();
                this.renderGrid();
                if (statusEl) statusEl.textContent = `成功加入 ${ok} 個${fail ? `（${fail} 張讀不到資訊：截圖 / JPG / 被平台洗過）` : ''} · 記得按底部「保存」`;
            },
            async renderGrid() {
                const grid = container.querySelector('#img-nai-pack-grid');
                if (!grid) return;
                if (!naiPresets.length) {
                    grid.innerHTML = '<div class="nai-pack-empty">還沒有預設。把下載的 NAI 圖拖進上面區塊，就會自動變成帶預覽圖的預設。</div>';
                    return;
                }
                grid.innerHTML = naiPresets.map((p, i) => {
                    const meta = [p.sampler, (p.scale != null ? ('CFG ' + p.scale) : ''), (p.steps != null ? (p.steps + ' steps') : '')].filter(Boolean).join(' · ');
                    return `<div class="nai-pack-card">
                        <div class="nai-pack-thumb">
                            <img class="nai-pack-thumb-img" data-thumb="${naiEscAttr(p.thumbId || '')}" alt="">
                            <span class="nai-pack-nothumb">${p.thumbId ? '讀取中…' : '無預覽'}</span>
                        </div>
                        <div class="nai-pack-name" title="${naiEscAttr(p.name)}">${naiEscAttr(p.name)}</div>
                        <div class="nai-pack-meta">${naiEscAttr(meta)}</div>
                        <div class="nai-pack-actions">
                            <span class="nai-pack-act" onclick="window._naiPreset.applyIdx(${i})">套用</span>
                            <span class="nai-pack-act" onclick="window._naiPreset.renameIdx(${i})" title="改名"><i class="fa-solid fa-pen"></i></span>
                            <span class="nai-pack-act is-danger" onclick="window._naiPreset.delIdx(${i})" title="刪除"><i class="fa-solid fa-trash-can"></i></span>
                        </div>
                    </div>`;
                }).join('');
                const OSDB = (window.parent || window).OS_DB;
                grid.querySelectorAll('.nai-pack-thumb-img[data-thumb]').forEach(async img => {
                    const tid = img.getAttribute('data-thumb');
                    if (!tid || !OSDB || !OSDB.getNaiThumb) return;
                    try {
                        const b64 = await OSDB.getNaiThumb(tid);
                        if (b64) { img.src = b64; img.classList.add('is-loaded'); const sib = img.nextElementSibling; if (sib) sib.remove(); }
                        else { const sib = img.nextElementSibling; if (sib) sib.textContent = '無預覽'; }
                    } catch (e) {}
                });
            },
            applyIdx(i) {
                const p = naiPresets[i]; if (!p) return;
                const set = (id, v) => { const el = container.querySelector(id); if (el && v != null) el.value = v; };
                set('#img-nai-char-base', p.charBasePrompt || '');
                set('#img-nai-char-neg',  p.charNegPrompt  || '');
                set('#img-nai-item-base', p.itemBasePrompt || '');
                set('#img-nai-item-neg',  p.itemNegPrompt  || '');
                if (p.sampler  != null) set('#img-nai-sampler', p.sampler);
                if (p.scale    != null) set('#img-nai-scale',   p.scale);
                if (p.steps    != null) set('#img-nai-steps',   p.steps);
                if (p.ucPreset != null) set('#img-nai-uc-preset', p.ucPreset);
                this.close();
                const W = window.parent || window;
                if (AUI.toastr) AUI.toastr.success(`已套用「${p.name || ''}」，記得按底部「保存」`);
            },
            async renameIdx(i) {
                const p = naiPresets[i]; if (!p) return;
                const nn = await AUI.prompt('改名：', p.name || '');
                if (nn == null) return;
                p.name = nn.trim() || p.name;
                refreshNaiPresetDropdown();
                this.renderGrid();
            },
            async delIdx(i) {
                const p = naiPresets[i]; if (!p) return;
                if (!await AUI.confirm(`刪除預設「${p.name || ''}」？`)) return;
                if (p.thumbId) _naiDelQ.thumbs.push(p.thumbId);
                naiPresets.splice(i, 1);
                refreshNaiPresetDropdown();
                this.renderGrid();
            }
        };

        // ── 🎨 NAI 氛圍轉印（Vibe Transfer）────────────────────────
        // encoding 本體（每模型 ~65KB base64）進 IndexedDB(nai_vibe_<id>)，naiVibes 只留 {id,name,strength,on} 輕引用進設定檔
        let naiVibes = [...(imgConfig.novelai.vibes || [])];
        const naiVibeModelLabel = mk => String(mk || '').replace(/^v/, 'V').replace('4-5', '4.5');

        window._naiVibe = {
            _init() {
                const drop = container.querySelector('#img-nai-vibe-drop');
                const file = container.querySelector('#img-nai-vibe-file');
                if (!drop) return;
                const self = this;
                drop.addEventListener('click', () => file && file.click());
                drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-drag'); });
                drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
                drop.addEventListener('drop', e => {
                    e.preventDefault(); drop.classList.remove('is-drag');
                    if (e.dataTransfer && e.dataTransfer.files) self.handleFiles(e.dataTransfer.files);
                });
                if (file) file.addEventListener('change', e => { self.handleFiles(e.target.files); e.target.value = ''; });
                this.renderList();
            },
            async handleFiles(fileList) {
                const OSDB = (window.parent || window).OS_DB;
                const statusEl = container.querySelector('#img-nai-vibe-status');
                const files = Array.from(fileList || []);
                if (!files.length) return;
                let ok = 0, upd = 0, fail = 0;
                for (const f of files) {
                    let obj = null;
                    try { obj = JSON.parse((await f.text()).replace(/^\uFEFF/, '')); } catch (e) {}
                    // 單檔(.naiv4vibe)或合集(.naiv4vibebundle 的 vibes[])都吃
                    const list = obj ? (Array.isArray(obj.vibes) ? obj.vibes : [obj]) : [];
                    let got = false;
                    for (const v of list) {
                        if (!v || !v.encodings || typeof v.encodings !== 'object') continue;
                        // 每個模型鍵收一顆 encoding：優先挑跟匯出時 information_extracted 相同的那顆
                        const encodings = {};
                        for (const mk of Object.keys(v.encodings)) {
                            const entries = Object.values(v.encodings[mk] || {}).filter(x => x && x.encoding);
                            if (!entries.length) continue;
                            const wantIe = v.importInfo && v.importInfo.information_extracted;
                            const hit = entries.find(x => x.params && x.params.information_extracted === wantIe) || entries[0];
                            encodings[mk] = hit.encoding;
                        }
                        if (!Object.keys(encodings).length) continue;
                        const id = String(v.id || ('nv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)));
                        const name = (v.name || (f.name || 'vibe').replace(/\.[^.]+$/, '')).slice(0, 40);
                        const exist = naiVibes.find(x => x.id === id);
                        if (exist) {
                            // 同 id 重複匯入＝補 encoding（同一張圖對不同模型各匯出一次的情況）
                            let rec = null;
                            try { rec = await OSDB.getNaiVibe(id); } catch (e) {}
                            const merged = Object.assign({}, (rec && rec.encodings) || {}, encodings);
                            await OSDB.saveNaiVibe(id, { name, thumb: (v.thumbnail || (rec && rec.thumb) || ''), encodings: merged });
                            exist.models = Object.keys(merged);
                            upd++;
                        } else {
                            await OSDB.saveNaiVibe(id, { name, thumb: v.thumbnail || '', encodings });
                            naiVibes.push({
                                id, name, on: true,
                                strength: (v.importInfo && typeof v.importInfo.strength === 'number') ? v.importInfo.strength : 0.6,
                                models: Object.keys(encodings)
                            });
                            ok++;
                        }
                        got = true;
                    }
                    if (!got) fail++;
                }
                this.renderList();
                if (statusEl) statusEl.textContent = `新增 ${ok} 個${upd ? `、更新 ${upd} 個` : ''}${fail ? `（${fail} 個檔讀不懂：要 NovelAI 匯出的 .naiv4vibe）` : ''} · 記得按底部「保存」`;
            },
            async renderList() {
                const listEl = container.querySelector('#img-nai-vibe-list');
                if (!listEl) return;
                if (!naiVibes.length) { listEl.innerHTML = ''; return; }
                listEl.innerHTML = naiVibes.map((v, i) => `
                    <div class="nai-vibe-row${v.on === false ? ' is-off' : ''}">
                        <label class="nai-vibe-on" title="這顆要不要用"><input type="checkbox" ${v.on === false ? '' : 'checked'} onchange="window._naiVibe.toggle(${i}, this.checked)"></label>
                        <div class="nai-vibe-thumb"><img data-vibe-thumb="${naiEscAttr(v.id)}" alt=""></div>
                        <div class="nai-vibe-main">
                            <div class="nai-vibe-name" title="${naiEscAttr(v.name)}">${naiEscAttr(v.name)}</div>
                            <div class="nai-vibe-models">${(v.models || []).map(naiVibeModelLabel).map(naiEscAttr).join(' · ')}</div>
                        </div>
                        <div class="nai-vibe-strength" title="參考強度">
                            <input type="range" min="0.05" max="1" step="0.05" value="${typeof v.strength === 'number' ? v.strength : 0.6}" oninput="window._naiVibe.setStrength(${i}, this.value, this)">
                            <span class="nai-vibe-strength-val">${(typeof v.strength === 'number' ? v.strength : 0.6).toFixed(2)}</span>
                        </div>
                        <span class="nai-pack-act is-danger nai-vibe-del" onclick="window._naiVibe.del(${i})" title="刪除"><i class="fa-solid fa-trash-can"></i></span>
                    </div>`).join('');
                const OSDB = (window.parent || window).OS_DB;
                listEl.querySelectorAll('img[data-vibe-thumb]').forEach(async img => {
                    try {
                        const rec = await OSDB.getNaiVibe(img.getAttribute('data-vibe-thumb'));
                        if (rec && rec.thumb) { img.src = rec.thumb; img.classList.add('is-loaded'); }
                    } catch (e) {}
                });
            },
            toggle(i, on) { if (naiVibes[i]) { naiVibes[i].on = !!on; this.renderList(); } },
            setStrength(i, val, el) {
                if (!naiVibes[i]) return;
                naiVibes[i].strength = parseFloat(val);
                const lab = el && el.parentElement && el.parentElement.querySelector('.nai-vibe-strength-val');
                if (lab) lab.textContent = parseFloat(val).toFixed(2);
            },
            async del(i) {
                const v = naiVibes[i]; if (!v) return;
                if (!await AUI.confirm(`刪除 Vibe「${v.name || ''}」？`)) return;
                _naiDelQ.vibes.push(v.id);
                naiVibes.splice(i, 1);
                this.renderList();
            }
        };
        window._naiVibe._init();

        // ── 場景插圖：規範提示詞模板 handlers ──────────────────────
        let sceneSpecTemplates = [...(imgConfig.sceneGen?.specTemplates || [])];

        function refreshSceneSpecDropdown() {
            const sel = container.querySelector('#img-scene-spec-sel');
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="">-- 選擇模板 --</option>' +
                sceneSpecTemplates.map((t, i) => `<option value="${i}">${_capiEsc(t.name)}</option>`).join('');
            if (cur !== '' && sceneSpecTemplates[parseInt(cur)]) sel.value = cur;
        }

        // 同步 NAI 預設包下拉（預設包存入後需刷新參考下拉）
        function refreshScenePresetRef() {
            const sel = container.querySelector('#img-scene-preset-ref');
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="">-- 從 NAI 預設包複製底詞 --</option>' +
                naiPresets.map((p, i) => `<option value="${i}">${_capiEsc(p.name)}</option>`).join('');
            if (cur !== '' && naiPresets[parseInt(cur)]) sel.value = cur;
        }

        window._sceneSpec = {
            apply() {
                const sel = container.querySelector('#img-scene-spec-sel');
                if (!sel || sel.value === '') { AUI.alert('請先選擇模板'); return; }
                const t = sceneSpecTemplates[parseInt(sel.value)];
                if (!t) return;
                const ta = container.querySelector('#img-scene-spec-prompt');
                if (ta) ta.value = t.prompt || '';
            },
            save() {
                const row = container.querySelector('#img-scene-spec-name-row');
                if (row) row.style.display = 'block';
                container.querySelector('#img-scene-spec-name-input')?.focus({ preventScroll: true });
            },
            confirmSave() {
                const nameInput = container.querySelector('#img-scene-spec-name-input');
                const name = nameInput?.value.trim();
                if (!name) { AUI.alert('請輸入模板名稱'); return; }
                const ta = container.querySelector('#img-scene-spec-prompt');
                sceneSpecTemplates.push({ name, prompt: ta?.value.trim() || '' });
                refreshSceneSpecDropdown();
                const sel = container.querySelector('#img-scene-spec-sel');
                if (sel) sel.value = String(sceneSpecTemplates.length - 1);
                const row = container.querySelector('#img-scene-spec-name-row');
                if (row) row.style.display = 'none';
                if (nameInput) nameInput.value = '';
            },
            cancelSave() {
                const row = container.querySelector('#img-scene-spec-name-row');
                if (row) row.style.display = 'none';
                const nameInput = container.querySelector('#img-scene-spec-name-input');
                if (nameInput) nameInput.value = '';
            },
            async del() {
                const sel = container.querySelector('#img-scene-spec-sel');
                if (!sel || sel.value === '') { AUI.alert('請先選擇要刪除的模板'); return; }
                const idx = parseInt(sel.value);
                const name = sceneSpecTemplates[idx]?.name || '';
                if (!await AUI.confirm(`刪除模板「${name}」？`)) return;
                sceneSpecTemplates.splice(idx, 1);
                refreshSceneSpecDropdown();
            },
            // 從 NAI 預設包複製底詞到場景底詞框
            applyPreset() {
                const sel = container.querySelector('#img-scene-preset-ref');
                if (!sel || sel.value === '') { AUI.alert('請先選擇 NAI 預設包'); return; }
                const p = naiPresets[parseInt(sel.value)];
                if (!p) return;
                const base = container.querySelector('#img-scene-base-prompt');
                const neg  = container.querySelector('#img-scene-neg-prompt');
                if (base) base.value = p.charBasePrompt || '';
                if (neg)  neg.value  = p.charNegPrompt  || '';
            }
        };

        // ===== 角色說話的聲音（總開關、角色配音名單、雲端兩家、本機小分頁）：在 os_settings_voice.js（參數注入 ctx＝閉包變數）=====
        //   保存時名單卡片由 OS_SETTINGS_VOICE.collectCast 收（見上面保存鈕）。
        // 🌐 外語角色名單（一般 → 外語）：改了當場存
        if ((window.parent || window).OS_VN_FOREIGN) (window.parent || window).OS_VN_FOREIGN.wire(container);
        if (window.OS_SETTINGS_VOICE && window.OS_SETTINGS_VOICE.wire) {
            window.OS_SETTINGS_VOICE.wire({ container: container, minimaxConfig: minimaxConfig });
        } else {
            console.warn('[OS_SETTINGS] os_settings_voice.js 未載入，語音清單區塊停用');
        }

        btnImgTest.onclick = async () => {
            const testPrompt = elImgTestPrompt.value.trim();
            if (!testPrompt) return;
            btnImgTest.innerText = "生成中...";
            btnImgTest.style.opacity = "0.5";
            status.innerText = "正在生成圖片...";

            try {
                const win = window.parent || window;
                const imageManager = win.OS_IMAGE_MANAGER;
                if (!imageManager) throw new Error('ImageManager 未載入');

                const getNum = (selector, def) => parseFloat(container.querySelector(selector)?.value ?? def);
                const getInt = (selector, def) => parseInt(container.querySelector(selector)?.value ?? def);
                
                imageManager.config.novelai.token = elNaiToken.value.trim();
                imageManager.config.novelai.url = (container.querySelector('#img-nai-url')?.value || '').trim();
                if (elNaiModel) imageManager.config.novelai.model = elNaiModel.value;
                imageManager.config.novelai.capFreeSize = container.querySelector('#img-nai-cap-free')?.checked ?? true;
                imageManager.config.novelai.sampler = container.querySelector('#img-nai-sampler')?.value || 'k_euler_ancestral';
                imageManager.config.novelai.scale = getNum('#img-nai-scale', 5);
                imageManager.config.novelai.steps = getInt('#img-nai-steps', 28);
                imageManager.config.novelai.ucPreset = getInt('#img-nai-uc-preset', 1);
                imageManager.config.novelai.qualityToggle = container.querySelector('#img-nai-quality-toggle')?.checked ?? true;
                imageManager.config.novelai.smea = container.querySelector('#img-nai-smea')?.checked ?? true;
                imageManager.config.novelai.smeaDyn = container.querySelector('#img-nai-smea-dyn')?.checked ?? false;
                imageManager.config.novelai.charBasePrompt = (container.querySelector('#img-nai-char-base')?.value || '').trim();
                imageManager.config.novelai.charNegPrompt = (container.querySelector('#img-nai-char-neg')?.value || '').trim();

                // 🧪 選一個地方試：走那一列真的分流（用哪組、畫風、尺寸都跟平常生圖一樣）。
                //   ComfyUI 的組合要先存好才試得到；還沒存的調整用 ComfyUI 頁組合卡上的「風格預覽」看。
                const _use = (container.querySelector('#img-test-use') || {}).value || 'avatar';
                const _u = (imageManager.useOf && imageManager.useOf(_use)) || { type: 'char' };
                const _genOpts = Object.assign({}, _useSize(_use), { force: true, use: _use });
                // 這一列沒選畫風、而它原本自己拼一段底詞（頭像／背景）→ 試的時候也照原本那段拼，跟平常一樣
                let _testPrompt = testPrompt;
                if (!(imageManager.styleFor && imageManager.styleFor(_use))) {
                    const _svc = imageManager.serviceForUse ? imageManager.serviceForUse(_use) : '';
                    const _tav = (_svc === 'tavern_sd' || _svc === 'comfyui_direct');
                    const _lp = _use === 'bg' ? vnD.bgBasePrompt : (_use === 'avatar' ? (_tav ? vnD.avatarBasePromptTavern : vnD.avatarBasePrompt) : '');
                    const _ln = _use === 'bg' ? vnD.bgNegPrompt : (_use === 'avatar' ? (_tav ? vnD.avatarNegPromptTavern : vnD.avatarNegPrompt) : '');
                    if (_lp) _testPrompt = _lp + ', ' + _testPrompt;
                    if (_ln) _genOpts.negativePrompt = _ln;
                    _genOpts.styleDone = true;
                }
                const imageUrl = (_use === 'item' || _use === 'app')
                    ? await imageManager.generateItem(_testPrompt, _genOpts)
                    : await imageManager.generate(_testPrompt, _u.type, _genOpts);

                imgTestImage.src = imageUrl;
                imgTestUrl.textContent = /^(data:|blob:)/.test(imageUrl) ? '圖片已生成（內嵌資料，省略顯示）' : `URL: ${imageUrl}`;
                imgTestPreview.style.display = 'block';

                imgTestImage.onload = () => { status.innerText = "圖片加載成功"; };
                imgTestImage.onerror = () => { status.innerText = "圖片加載失敗 (請檢查 API Key / Token)"; };

            } catch(e) {
                console.error(e);
                status.innerText = `錯誤: ${e.message}`;
            } finally {
                btnImgTest.innerHTML = '<i class="fa-solid fa-palette"></i> 生成預覽';
                btnImgTest.style.opacity = "1";
            }
        };

    }

    // ── 「一般」分頁：顯示位置 / 訊息可收合 ──────────────────────────────
    //   跟這頁其他設定不同，這兩格不走底部「保存所有設定」——它們原本在酒館抽屜就是改完當場生效，
    //   搬過來保持一樣，免得她改完以為生效了、其實還要再按一顆按鈕。
    function bindTavernTab(container) {
        const W = _tvWin();

        const elMount = container.querySelector('#mp-mount-selector');
        if (elMount) {
            elMount.onchange = () => {
                const st = loadTavernExtSettings();
                const mount = { ...(st.mount || {}), selector: elMount.value };
                saveTavernExtSettings({ mount });
                if (AUI.toastr) AUI.toastr.success('重整酒館之後挪過去');
            };
        }

        const elHeight = container.querySelector('#mp-panel-height');
        if (elHeight) {
            // 邊打邊套：她要看得到窗變矮才知道數字對不對，等她離開欄位才生效等於要來回猜。
            //   夾在 30–100 之後才存，避免她中途打出的半截數字（打「5」要打「50」）把窗縮到看不見。
            const applyHeight = () => {
                const raw = elHeight.value.trim();
                let val = '';
                if (raw !== '') {
                    const n = Math.round(Number(raw));
                    if (!isFinite(n)) return;
                    val = Math.min(100, Math.max(30, n));
                }
                saveTavernExtSettings({ panelHeight: val });
                try { (W.AureliaControlCenter || window.AureliaControlCenter)?.applyEmbeddedHeight?.(); } catch (e) {}
            };
            elHeight.oninput = applyHeight;
            // 離開欄位才把夾過的值寫回輸入框，打字中途不跳數字搶她的游標
            elHeight.onblur = () => {
                const raw = elHeight.value.trim();
                if (raw === '') return;
                const n = Math.round(Number(raw));
                elHeight.value = isFinite(n) ? Math.min(100, Math.max(30, n)) : '';
                applyHeight();
            };
        }

        const elCollapse = container.querySelector('#mp-message-collapse');
        if (elCollapse) {
            elCollapse.onchange = () => {
                const on = elCollapse.checked;
                saveTavernExtSettings({ messageCollapse: on });

                const UI = W.AureliaUIUtils || window.AureliaUIUtils;
                if (!UI || !UI.reinitializeCollapse) {
                    if (AUI.toastr) AUI.toastr.info('設置已保存，重整酒館後生效');
                    return;
                }
                if (on) {
                    UI.reinitializeCollapse();
                    if (AUI.toastr) AUI.toastr.success('已開啟訊息收合');
                    return;
                }
                // 關閉：拔掉所有收合鈕、清掉每則訊息的收合記憶、把藏起來的內容還原
                try {
                    W.document.querySelectorAll('.mes-collapse-btn').forEach(btn => btn.remove());
                    const chat = W.document.querySelector('#chat');
                    if (chat) {
                        chat.querySelectorAll('.mes').forEach(msg => {
                            const mesid = msg.getAttribute('mesid');
                            if (mesid) { try { W.localStorage.removeItem(UI.collapseKey(mesid)); } catch (e) {} }   // 收合記憶的 key 帶聊天室（ui_utilities 的 collapseKey），清的時候要用同一把
                            const block = msg.querySelector('.mes_block');
                            if (block) {
                                Array.from(block.children).forEach(child => {
                                    if (!child.classList.contains('ch_name') && !child.classList.contains('mes_edit_buttons')) child.style.display = '';
                                });
                            }
                            const avatar = msg.querySelector('.mesAvatarWrapper');
                            if (avatar) avatar.style.display = '';
                        });
                    }
                } catch (e) { console.warn('[Settings] 還原收合狀態失敗', e); }
                if (AUI.toastr) AUI.toastr.success('已關閉訊息收合');
            };
        }
    }

    // 🎨 房間畫風（自訂接口畫房間用）的下拉選項：組設定頁畫面時就要用，所以放在模組層、不放 wire 裡
    window._roomStyleOpts = (r) => {
        const _e = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        return '<option value=""' + (r.style ? '' : ' selected') + '>照圖片設置的底詞</option>'
            + (r.styles || []).map(x => '<option value="' + _e(x.name) + '"' + (x.name === r.style ? ' selected' : '') + '>' + _e(x.name) + '</option>').join('');
    };
    window.OS_SETTINGS.launchApp = launchApp;
    // 相簿 app（大廳手機殼）：用同一引擎跑「只顯示畫廊」模式
    window.OS_SETTINGS.launchAlbum = function (container) { return launchApp(container, 'album'); };

    function install() {
        const win = window.parent || window;
        if (win.PhoneSystem) { win.PhoneSystem.install('設置', '⚙️', '#4c4c4c', launchApp); }
        else { setTimeout(install, 500); }
    }
    install();
})();