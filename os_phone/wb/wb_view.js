// ----------------------------------------------------------------
// [微博] wb_view.js (V3.7 - Comment List Extract)
// 職責：渲染微博介面
// 升級：
// 1. 抽取 renderCommentList 獨立方法，支援局部更新評論列表
// 2. 修復評論區「我」的頭像顯示為綠色預設圖的問題，現在會正確使用用戶頭像
// 3. 增強名字顯示邏輯，若暱稱未同步，優先顯示真名而不是「我」
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;

    win.WB_VIEW = {
        
        getAvatar: function(name) {
            return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name || 'User')}`;
        },

        getMyDisplayName: function() {
            let nickname = '我';
            let realName = 'User';
            if (win.WB_ACCOUNT && typeof win.WB_ACCOUNT.getCurrentAccount === 'function') {
                const acc = win.WB_ACCOUNT.getCurrentAccount();
                nickname = acc.weiboNickname || 'User';
                realName = acc.realName || 'User';
            }
            if (nickname === realName) return nickname;
            return `${nickname} (${realName})`;
        },

        // 輔助：獲取我的真實頭像
        getMyAvatar: function() {
            if (win.WB_ACCOUNT && typeof win.WB_ACCOUNT.getCurrentAccount === 'function') {
                const acc = win.WB_ACCOUNT.getCurrentAccount();
                if (acc.avatar) return acc.avatar;
            }
            return this.getAvatar('Me');
        },

        // --- 1. 渲染單張卡片 ---
        renderCard: function(post, isDetail = false) {
            // 如果是本人發帖，強制使用最新頭像
            const avatar = post.isMe ? this.getMyAvatar() : (post.avatar || this.getAvatar(post.user));
            let contentHtml = post.content || '';
            let displayName = post.user;
            
            if (post.isMe) displayName = this.getMyDisplayName();

            // 🔥 优先从 post.media 读取媒体信息（由 wb_core.js 解析）
            let voteHtml = '';
            let videoHtml = '';
            let imagesHtml = '';

            if (post.media) {
                if (post.media.type === 'vote') {
                    const title = post.media.title || '投票';
                    const options = post.media.options || [];
                    const totalVotes = Math.floor(Math.random() * 5000) + 500;
                    let optionHtmls = options.map(opt => {
                        const percent = Math.floor(Math.random() * 80) + 10;
                        return `<div class="wb-vote-option"><div class="wb-vote-bar-bg"><div class="wb-vote-bar-fill" style="width: ${percent}%"></div><span class="wb-vote-txt">${opt}</span><span class="wb-vote-count">${percent * 12}票</span></div></div>`;
                    }).join('');
                    voteHtml = `<div class="wb-vote-card"><div class="wb-vote-title"><span class="wb-vote-icon">投票</span> ${title}</div>${optionHtmls}<div style="font-size:11px; color:#999; margin-top:5px;">${totalVotes} 人參與 · 已結束</div></div>`;
                } else if (post.media.type === 'video') {
                    const title = post.media.title || '視頻';
                    const desc = post.media.desc || '';
                    const escapedTitle = (title || '').replace(/'/g, "\\'");
                    const escapedDesc = (desc || '').replace(/'/g, "\\'");

                    // 点击展开完整描述（支持移动端）
                    const clickHandler = desc
                        ? `event.stopPropagation(); alert('${escapedTitle}\\n\\n${escapedDesc}');`
                        : `event.stopPropagation(); window.open('https://www.bilibili.com/results?search_query=${encodeURIComponent(title)}')`;

                    videoHtml = `<div class="wb-video-card" onclick="${clickHandler}">
                        <div class="wb-video-overlay"></div>
                        <div class="wb-play-icon"><div class="wb-play-arrow"></div></div>
                        <div class="wb-video-tag">03:45</div>
                        <div style="position:absolute; bottom:10px; left:10px; right:10px; color:white; font-size:12px; font-weight:bold; z-index:2; text-shadow:0 1px 2px rgba(0,0,0,0.5);">
                            <div style="margin-bottom:3px;">${title}</div>
                            ${desc ? `<div style="font-size:10px; font-weight:normal; opacity:0.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${desc.substring(0, 30)}${desc.length > 30 ? '...' : ''}</div>` : ''}
                        </div>
                        ${desc ? '<div style="position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.6); color:white; padding:4px 8px; border-radius:12px; font-size:11px; z-index:3;">點擊查看</div>' : ''}
                    </div>`;
                } else if (post.media.type === 'image') {
                    const desc = post.media.desc || '';
                    if (desc.startsWith('http')) {
                        // 真实图片 URL
                        imagesHtml = `<div class="wb-img-grid" style="grid-template-columns: 1fr;"><div class="wb-img-item" style="background-image:url('${desc}')" onclick="event.stopPropagation(); window.open('${desc}')"></div></div>`;
                    } else {
                        // 图片描述文字：显示在灰色占位框里
                        imagesHtml = `<div class="wb-img-grid" style="grid-template-columns: 1fr;">
                            <div class="wb-img-item" style="background:#e8e8e8; display:flex; align-items:center; justify-content:center; padding:15px; min-height:120px;" onclick="event.stopPropagation();">
                                <div style="text-align:center; color:#666; font-size:13px; line-height:1.5;">
                                    <div style="font-size:28px; margin-bottom:8px;">🖼️</div>
                                    <div>${desc}</div>
                                </div>
                            </div>
                        </div>`;
                    }
                } else if (post.media.type === 'images') {
                    // 🔥 多图展示
                    const images = post.media.list || [];
                    const count = images.length;

                    // 决定网格列数：1图=1列，2-4图=2列，5-9图=3列
                    const cols = count === 1 ? 1 : (count <= 4 ? 2 : 3);

                    const imageItems = images.map((desc, idx) => {
                        const isUrl = desc.startsWith('http');
                        if (isUrl) {
                            return `<div class="wb-img-item" style="background-image:url('${desc}')" onclick="event.stopPropagation(); window.open('${desc}')"></div>`;
                        } else {
                            // 多图时：只显示序号和图标，不显示完整描述（太挤）
                            const shortDesc = desc.length > 20 ? desc.substring(0, 20) + '...' : desc;
                            return `<div class="wb-img-item" style="background:#e8e8e8; display:flex; align-items:center; justify-content:center; flex-direction:column; padding:8px;" onclick="event.stopPropagation();" title="${desc}">
                                <div style="font-size:20px; margin-bottom:4px;">🖼️</div>
                                <div style="font-size:11px; color:#999; text-align:center; line-height:1.3;">${idx + 1}/${count}</div>
                                <div style="font-size:10px; color:#aaa; text-align:center; margin-top:2px; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${shortDesc}</div>
                            </div>`;
                        }
                    }).join('');

                    imagesHtml = `<div class="wb-img-grid" style="grid-template-columns: repeat(${cols}, 1fr);">${imageItems}</div>`;
                }
            }

            // 🔥 兜底：如果 post.media 没有，尝试从 content 中提取
            if (!voteHtml) {
                const voteMatch = contentHtml.match(/\[(Vote|投票)[:：]\s*(.*?)(?:\||：)\s*(.*?)\]/i);
                if (voteMatch) {
                    const title = voteMatch[2].trim();
                    const options = voteMatch[3].split(/[,，]/).map(s => s.trim()).filter(s => s);
                    const totalVotes = Math.floor(Math.random() * 5000) + 500;
                    let optionHtmls = options.map(opt => {
                        const percent = Math.floor(Math.random() * 80) + 10;
                        return `<div class="wb-vote-option"><div class="wb-vote-bar-bg"><div class="wb-vote-bar-fill" style="width: ${percent}%"></div><span class="wb-vote-txt">${opt}</span><span class="wb-vote-count">${percent * 12}票</span></div></div>`;
                    }).join('');
                    voteHtml = `<div class="wb-vote-card"><div class="wb-vote-title"><span class="wb-vote-icon">投票</span> ${title}</div>${optionHtmls}<div style="font-size:11px; color:#999; margin-top:5px;">${totalVotes} 人參與 · 已結束</div></div>`;
                    contentHtml = contentHtml.replace(voteMatch[0], '');
                }
            }

            if (!videoHtml) {
                const videoMatch = contentHtml.match(/\[(Video|视频|視頻)[:：]\s*(.*?)\]/i);
                if (videoMatch) {
                    const desc = videoMatch[2].trim();
                    videoHtml = `<div class="wb-video-card" onclick="event.stopPropagation(); window.open('https://www.bilibili.com/results?search_query=${encodeURIComponent(desc)}')"><div class="wb-video-overlay"></div><div class="wb-play-icon"><div class="wb-play-arrow"></div></div><div class="wb-video-tag">03:45</div><div style="position:absolute; bottom:10px; left:10px; color:white; font-size:12px; font-weight:bold; z-index:2; text-shadow:0 1px 2px rgba(0,0,0,0.5);">${desc}</div></div>`;
                    contentHtml = contentHtml.replace(videoMatch[0], '');
                }
            }

            if (!imagesHtml) {
                const imgMatches = contentHtml.match(/\[(Img|图片|圖片)[:：]\s*(.*?)\]/gi);
                if (imgMatches) {
                    let imgList = [];
                    imgMatches.forEach(tag => {
                        let url = tag.replace(/\[(Img|图片|圖片)[:：]\s*/i, '').replace(']', '').trim();
                        if(!url.startsWith('http')) url = '';
                        imgList.push(url);
                        contentHtml = contentHtml.replace(tag, '');
                    });
                    if (imgList.length > 0) {
                        imagesHtml = `<div class="wb-img-grid" style="grid-template-columns: repeat(${Math.min(3, imgList.length)}, 1fr);">${imgList.map(url => { const bg = url ? `background-image:url('${url}')` : `background:#ddd; display:flex; align-items:center; justify-content:center; color:#999; font-size:20px;`; const inner = url ? '' : '🖼️'; return `<div class="wb-img-item" style="${bg}" onclick="event.stopPropagation(); window.open('${url}')">${inner}</div>`; }).join('')}</div>`;
                    }
                }
            }

            // 提取 hashtag，從正文移除，底部獨立渲染成橘色標籤
            const hashtagRegex = /#[^\s，。！？,.!?\[\]{}\n#]+/g;
            const hashTags = contentHtml.match(hashtagRegex) || [];
            if (hashTags.length > 0) {
                contentHtml = contentHtml.replace(hashtagRegex, '').trim();
            }
            const tagsHtml = hashTags.length > 0
                ? `<div class="wb-tags">${hashTags.map(t => `<span class="wb-tag">${t}</span>`).join('')}</div>`
                : '';

            const appRef = "(window.parent.wbApp || window.wbApp)";
            const clickAttr = isDetail ? '' : `onclick="${appRef}.openDetail('${post.id}')"`;
            const cardClass = isDetail ? 'wb-detail-card' : 'wb-card';
            const deleteBtn = (post.isMe) ? `<span style="color:#576b95; font-size:12px; margin-left:auto; cursor:pointer;" onclick="event.stopPropagation(); ${appRef}.deletePost('${post.id}')">删除</span>` : '';

            return `
                <div class="${cardClass}" ${clickAttr}>
                    <div class="wb-user-row">
                        <div class="wb-avatar" style="background-image: url('${avatar}')"></div>
                        <div class="wb-user-info">
                            <div class="wb-username">${displayName} <span class="wb-vip-icon">V</span> ${deleteBtn}</div>
                            <div class="wb-time">${post.time || '剛剛'} · 來自 PhoneOS</div>
                        </div>
                        ${post.isMe ? '<div style="font-size:10px; color:#ff8200; border:1px solid #ff8200; padding:1px 4px; border-radius:4px;">本人</div>' : ''}
                    </div>
                    <div class="wb-text">${contentHtml.trim()}</div>
                    ${tagsHtml}
                    ${voteHtml} ${videoHtml} ${imagesHtml}
                    
                    <div class="wb-actions">
                        <div class="wb-act-btn" onclick="event.stopPropagation(); ${appRef}.shareToWx('${post.id}')"><span>↗</span> 轉發</div>
                        <div class="wb-act-btn"><span>💬</span> ${post.comments ? post.comments.length : 0}</div>
                        <div class="wb-act-btn" onclick="event.stopPropagation(); this.innerHTML='<span>👍</span> ' + (${(post.likes||0)} + 1); this.style.color='#ff8200';"><span>👍</span> ${post.likes || 0}</div>
                    </div>
                </div>
            `;
        },

        // --- 2A. 渲染評論列表 (獨立方法，用於局部更新) ---
        renderCommentList: function(post) {
            const appRef = "(window.parent.wbApp || window.wbApp)";
            if (post.comments && post.comments.length > 0) {
                // 🔥 Debug: 顯示評論原始數據
                console.log('[WB_VIEW] 評論原始數據:', post.comments);

                return post.comments.map((c, index) => {
                    let cName = '路人';
                    let cContent = c;
                    if (typeof c === 'object') { cName = c.author || '路人'; cContent = c.content; }
                    else if (typeof c === 'string' && c.includes(':')) { const parts = c.split(/[:：]/); if (parts.length >= 2) { cName = parts[0].trim(); cContent = parts.slice(1).join(':').trim(); } }

                    // 🔥 Debug: 顯示解析後的名字
                    console.log(`[WB_VIEW] 評論 #${index} - 原始:`, c, '→ 解析名字:', cName);

                    let isMyComment = false;
                    let displayCommentName = cName;

                    if (post.isMe && cName === '我') isMyComment = true;
                    if (cName === '我' || cName === 'User' || cName === 'Me') isMyComment = true;
                    if (win.WB_ACCOUNT && typeof win.WB_ACCOUNT.getCurrentAccount === 'function') {
                        const acc = win.WB_ACCOUNT.getCurrentAccount();
                        if (cName === acc.weiboNickname || cName === acc.realName) isMyComment = true;
                    }
                    if (isMyComment) displayCommentName = this.getMyDisplayName();

                    // 🔥 [修復] 使用正確的頭像
                    const cAvatar = isMyComment ? this.getMyAvatar() : this.getAvatar(displayCommentName);

                    // 🔥 [全開刪除權限] 所有評論都可以刪除
                    const delHtml = `<span class="wb-cmt-del" onclick="${appRef}.deleteComment('${post.id}', ${index})">删除</span>`;
                    const highlightStyle = isMyComment ? 'color:#ff8200;' : '';

                    // 回覆按鈕：點擊後在輸入框填入 "回覆 名字: "
                    const escapedName = cName.replace(/'/g, "\\'");
                    const replyHtml = `<span class="wb-cmt-reply" onclick="const inp=(window.parent&&window.parent.document||document).getElementById('wb-comment-input'); if(inp){inp.value='回覆 ${escapedName}: '; inp.focus(); const btn=inp.parentElement&&inp.parentElement.nextElementSibling; if(btn)btn.classList.add('active');}">回覆</span>`;

                    return `
                        <div class="wb-comment-item">
                            <div class="wb-cmt-avatar" style="background-image:url('${cAvatar}')"></div>
                            <div class="wb-cmt-body">
                                <div class="wb-cmt-user"><span style="${highlightStyle}">${displayCommentName}</span> ${delHtml}</div>
                                <div class="wb-cmt-content">${cContent}</div>
                                <div class="wb-cmt-time">剛剛 ${replyHtml}</div>
                            </div>
                        </div>`;
                }).join('');
            } else {
                return '<div class="wb-empty">暫無評論，快來搶沙發！</div>';
            }
        },

        // --- 2. 渲染詳情頁 ---
        renderDetailPage: function(post) {
            const appRef = "(window.parent.wbApp || window.wbApp)";
            const commentsHtml = this.renderCommentList(post);

            return `
                <div class="wb-detail-page">
                    <div class="wb-header">
                        <div class="wb-header-btn" onclick="${appRef}.closeDetail()">‹</div>
                        <div class="wb-header-title">微博正文</div>
                    </div>
                    <div class="wb-detail-content">
                        ${this.renderCard(post, true)}
                        <div class="wb-comment-sec">
                            <div class="wb-comment-header">評論 ${post.comments ? post.comments.length : 0}</div>
                            <div id="wb-comment-list">${commentsHtml}</div>
                            <div class="wb-load-more" id="wb-load-more-btn" onclick="${appRef}.startLoadMore(this, '${post.id}')">↻ 載入更多評論</div>
                        </div>
                    </div>
                    <div class="wb-input-bar">
                        <div class="wb-input-wrapper">
                            <input type="text" class="wb-input" id="wb-comment-input" placeholder="寫評論..." oninput="const btn=this.parentElement.nextElementSibling; if(this.value.trim()) btn.classList.add('active'); else btn.classList.remove('active');">
                        </div>
                        <div class="wb-send-btn" onclick="${appRef}.sendComment('${post.id}')">發送</div>
                    </div>
                </div>
            `;
        },

        renderMePage: function(isDark = false) {
            let account = { weiboNickname: 'User', realName: 'User', bio: '...', avatar: '', followers: 1024, following: 128, posts: 0 };
            if (win.WB_ACCOUNT && typeof win.WB_ACCOUNT.getCurrentAccount === 'function') account = win.WB_ACCOUNT.getCurrentAccount();
            const avatarStyle = account.avatar ? `background-image: url('${account.avatar}')` : `background-image: url('${this.getAvatar(account.weiboNickname)}')`;
            const appRef = "(window.parent.wbApp || window.wbApp)";

            const pageBg      = isDark ? '#111'     : '#fff';
            const cardBg      = isDark ? '#1c1c1e'  : '#fff';
            const borderColor = isDark ? '#2a2a2a'  : '#f0f0f0';
            const textColor   = isDark ? '#f0f0f0'  : '#333';
            const subColor    = isDark ? '#666'     : '#999';
            const shadowStyle = isDark ? ''         : 'box-shadow: 0 2px 10px rgba(0,0,0,0.05);';
            const verColor    = isDark ? '#444'     : '#ccc';
            const darkBadge   = isDark
                ? '<span style="background:#ff8200; color:#fff; font-size:11px; padding:2px 8px; border-radius:10px;">已開啟</span>'
                : '<span style="background:#ddd; color:#999; font-size:11px; padding:2px 8px; border-radius:10px;">已關閉</span>';

            return `<div style="background: ${pageBg}; height: 100%; overflow-y: auto;">
                    <div style="background: linear-gradient(to bottom, #ffae00, #ff8200); padding: 40px 20px 20px 20px; color: #fff; display:flex; flex-direction:column; align-items:center;">
                        <div style="width: 70px; height: 70px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.5); ${avatarStyle}; background-size: cover; margin-bottom: 10px; background-color:#fff;"></div>
                        <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${account.weiboNickname}</div>
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">真名：${account.realName}</div>
                        <div style="font-size: 12px; opacity: 0.8; margin-bottom: 15px; max-width:80%; text-align:center;">${account.bio}</div>
                        <div style="display:flex; gap: 30px; font-size: 13px; text-align:center;">
                            <div><div style="font-weight:bold; font-size:16px;">${account.following}</div><div>關注</div></div>
                            <div><div style="font-weight:bold; font-size:16px;">${account.followers}</div><div>粉絲</div></div>
                            <div><div style="font-weight:bold; font-size:16px;">${account.posts}</div><div>微博</div></div>
                        </div>
                    </div>
                    <div style="padding: 10px;">
                        <div style="background: ${cardBg}; border-radius: 8px; ${shadowStyle} overflow: hidden;">
                            <div class="wb-cell" onclick="${appRef}.showContacts()" style="padding: 15px; border-bottom: 1px solid ${borderColor}; display:flex; justify-content:space-between; align-items:center; cursor:pointer;"><div style="display:flex; align-items:center; gap:10px;"><span style="font-size:20px;">👥</span><span style="font-size:14px; font-weight:500; color:${textColor};">關注列表</span></div><span style="color:${subColor};">›</span></div>
                            <div class="wb-cell" onclick="${appRef}.editNickname()" style="padding: 15px; border-bottom: 1px solid ${borderColor}; display:flex; justify-content:space-between; align-items:center; cursor:pointer;"><div style="display:flex; align-items:center; gap:10px;"><span style="font-size:20px;">🏷️</span><span style="font-size:14px; font-weight:500; color:${textColor};">編輯暱稱</span></div><span style="color:${subColor};">›</span></div>
                            <div class="wb-cell" onclick="${appRef}.editBio()" style="padding: 15px; border-bottom: 1px solid ${borderColor}; display:flex; justify-content:space-between; align-items:center; cursor:pointer;"><div style="display:flex; align-items:center; gap:10px;"><span style="font-size:20px;">✏️</span><span style="font-size:14px; font-weight:500; color:${textColor};">編輯個性簽名</span></div><span style="color:${subColor};">›</span></div>
                            <div class="wb-cell" onclick="${appRef}.toggleDarkMode()" style="padding: 15px; border-bottom: 1px solid ${borderColor}; display:flex; justify-content:space-between; align-items:center; cursor:pointer;"><div style="display:flex; align-items:center; gap:10px;"><span style="font-size:20px;">🌙</span><span style="font-size:14px; font-weight:500; color:${textColor};">黑夜模式</span></div>${darkBadge}</div>
                            <div class="wb-cell" onclick="${appRef}.clearAllData()" style="padding: 15px; border-top: 1px solid ${borderColor}; display:flex; justify-content:space-between; align-items:center; cursor:pointer;"><div style="display:flex; align-items:center; gap:10px;"><span style="font-size:20px;">🗑️</span><span style="font-size:14px; font-weight:500; color:#ff4444;">清空所有微博</span></div></div>
                        </div>
                        <div style="margin-top:20px; text-align:center; color:${verColor}; font-size:12px;">PhoneOS Weibo V3.7</div>
                    </div>
                </div>`;
        },

        renderApp: function(posts, activeTab = 'home', isLoading = false, isDark = false) {
            const appRef = "(window.parent.wbApp || window.wbApp)";
            let contentArea = '';
            let loadingHtml = '';
            if (isLoading) {
                loadingHtml = `<div class="wb-loader-box"><div class="wb-spinner"></div><div>正在連接世界信號...</div></div>`;
            }

            if (activeTab === 'home') {
                if ((!posts || posts.length === 0) && !isLoading) {
                    contentArea = `<div style="text-align:center; padding:50px; color:#999;">暫無動態<br>點擊右下角按鈕生成</div>`;
                } else {
                    contentArea = posts.map(p => this.renderCard(p, false)).join('');
                    contentArea = loadingHtml + contentArea;
                }
            } else if (activeTab === 'me') {
                contentArea = this.renderMePage(isDark);
            }

            const fabStyle = activeTab === 'me' ? 'display:none;' : '';
            return `
                <div class="wb-shell${isDark ? ' wb-dark' : ''}">
                    <div class="wb-header">
                        <div class="wb-header-btn" onclick="(window.parent.PhoneSystem || window.PhoneSystem).goHome()">‹</div>
                        <div class="wb-header-title">微博</div>
                    </div>
                    <div class="wb-content" id="wb-feed">${contentArea}</div>
                    <div class="wb-fab" onclick="${appRef}.triggerPost()" style="${fabStyle}">✨</div>
                    <div class="wb-tab-bar">
                        <div class="wb-tab ${activeTab === 'home' ? 'active' : ''}" onclick="${appRef}.switchTab('home')"><div class="wb-tab-icon">🏠</div></div>
                        <div class="wb-tab ${activeTab === 'me' ? 'active' : ''}" onclick="${appRef}.switchTab('me')"><div class="wb-tab-icon">👤</div></div>
                    </div>
                    <div id="wb-detail-container"></div>
                </div>
            `;
        }
    };
})();