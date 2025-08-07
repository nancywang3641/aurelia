/**
 * echo-listeners.js - Handles the Echo social media platform modal integrated into the VN panel.
 * MODIFIED:
 * - Revised parseEchoSection to correctly handle comments, hot search items, and profile items
 * based on the multi-line structure provided in Echo範例.md.
 */
(function() {
    console.log('[EchoListeners] Initializing Echo Modal System (v2)...');

    let echoModal, echoModalCloseButton;
    let echoTabsContainer, echoContentContainer;
    let echoTimelineTabContent, echoTrendingTabContent, echoProfileTabContent;
    let echoLoadingTimeline, echoLoadingTrending, echoLoadingProfile;

    const DEFAULT_ACTIVE_TAB_SELECTOR = '.echo-tab-integrated[data-tab-target="#echoTimelineTabIntegrated"]';

    const ICONS = { // SVG Icons
        comment: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.446 7.262 7.772v2.06h-.004l1.89 2.06c.196.216.49.338.792.338.346 0 .652-.14.882-.378l1.484-1.716v-.002H21.6c1.934 0 3.426-1.492 3.426-3.426V10.04c0-4.375-3.426-7.8-7.8-7.8h-.004zM12 18.56c-3.405 0-6.1-2.776-6.1-6.196S8.595 6.17 12 6.17s6.098 2.777 6.098 6.196c0 3.42-2.693 6.196-6.098 6.196z"></path></g></svg>`,
        retweet: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M23.77 15.67c-.292-.293-.767-.293-1.06 0l-2.246 2.245V7.616c0-1.336-1.076-2.412-2.413-2.412H12.95c-.803 0-1.54.39-1.982 1.016L8.09 11.832c-.616.797-1.573 1.25-2.592 1.25H3.32c-1.032 0-1.872-.84-1.872-1.87s.84-1.87 1.872-1.87H7.41c.388 0 .717-.228.874-.575.157-.346.036-.762-.278-1.003L2.82 3.203c-.574-.458-1.373-.42-1.905.097-.532.518-.566 1.377-.072 1.93l3.186 3.61V15.67H1.05c-.292 0-.53.238-.53.53V17.9c0 .292.238.53.53.53H7.9c.803 0 1.54-.39 1.982-1.016L12.76 12.2c.616-.796 1.573-1.25 2.592-1.25h2.174v9.09h-2.246c-.292 0-.53.238-.53.53v1.698c0 .292.238.53.53.53h8.982c.292 0 .53-.238.53-.53V17.9c0-.292-.238-.53-.53-.53h-2.246l2.246-2.245c.293-.293.293-.768 0-1.06z"></path></g></svg>`,
        like: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M12 21.638h-.014C9.403 21.59 1.95 14.856 1.95 8.478c0-3.064 2.525-5.754 5.403-5.754 2.29 0 4.373 1.106 5.646 2.923.16.24.395.432.656.54.26-.108.496-.298.656-.54 1.273-1.817 3.356-2.923 5.646-2.923 2.878 0 5.404 2.69 5.404 5.754 0 6.376-7.454 13.11-10.037 13.156H12zM7.353 4.225C5.403 4.225 3.45 5.782 3.45 8.478c0 4.795 5.995 10.25 8.55 10.997.012 0 .024 0 .036 0 .012 0 .024 0 .036 0 2.554-.746 8.55-6.193 8.55-10.997 0-2.696-1.953-4.253-3.903-4.253-1.75 0-3.48.92-4.467 2.364-.155.22-.37.39-.614.49-.244-.1-.46-.27-.614-.49-.988-1.444-2.716-2.364-4.467-2.364z"></path></g></svg>`
    };

    function initializeDOMElements() {
        echoModal = document.getElementById('echoModalIntegrated');
        echoModalCloseButton = document.getElementById('echoModalIntegratedCloseButton');
        echoTabsContainer = document.querySelector('#echoModalIntegrated .echo-tabs-integrated');
        echoContentContainer = document.querySelector('#echoModalIntegrated .echo-content-integrated');
        echoTimelineTabContent = document.getElementById('echoTimelineTabIntegrated');
        echoTrendingTabContent = document.getElementById('echoTrendingTabIntegrated');
        echoProfileTabContent = document.getElementById('echoProfileTabIntegrated');
        if (!echoModal || !echoTabsContainer || !echoContentContainer || !echoTimelineTabContent || !echoTrendingTabContent || !echoProfileTabContent) {
            console.error('[EchoListeners] Critical Echo modal DOM elements not found!');
            return false;
        }
        if (echoTimelineTabContent) echoLoadingTimeline = echoTimelineTabContent.querySelector('.echo-loading-placeholder');
        if (echoTrendingTabContent) echoLoadingTrending = echoTrendingTabContent.querySelector('.echo-loading-placeholder');
        if (echoProfileTabContent) echoLoadingProfile = echoProfileTabContent.querySelector('.echo-loading-placeholder');
        return true;
    }

    function setupEventListeners() {
        if (echoModalCloseButton) echoModalCloseButton.addEventListener('click', closeEchoModal);
        if (echoTabsContainer) {
            echoTabsContainer.querySelectorAll('.echo-tab-integrated').forEach(tab => {
                tab.addEventListener('click', () => switchTab(tab));
            });
        }
        if (echoModal) {
            echoModal.addEventListener('click', function(event) {
                if (event.target === echoModal) closeEchoModal();
            });
        }
    }

    function switchTab(clickedTab) {
        if (!clickedTab || !echoTabsContainer || !echoContentContainer) return;
        if (!clickedTab.classList.contains('active')) {
            echoTabsContainer.querySelectorAll('.echo-tab-integrated').forEach(t => t.classList.remove('active'));
            echoContentContainer.querySelectorAll('.tab-content-integrated').forEach(c => c.classList.remove('active'));
            clickedTab.classList.add('active');
            const targetContentId = clickedTab.getAttribute('data-tab-target');
            if (targetContentId) {
                const targetContent = echoContentContainer.querySelector(targetContentId);
                if (targetContent) targetContent.classList.add('active');
            }
        }
    }
    
    function resetToDefaultTab() {
        const defaultTab = echoTabsContainer ? echoTabsContainer.querySelector(DEFAULT_ACTIVE_TAB_SELECTOR) : null;
        if (defaultTab) switchTab(defaultTab);
        else { const firstTab = echoTabsContainer ? echoTabsContainer.querySelector('.echo-tab-integrated') : null; if (firstTab) switchTab(firstTab); }
    }

    function parseEchoSection(echoDataString) {
        if (!echoDataString || typeof echoDataString !== 'string') {
            console.warn('[EchoListeners] Invalid or empty echoDataString received for parsing.');
            return { posts: [], hotSearches: [], profiles: [] };
        }

        const lines = echoDataString.trim().split(/\r?\n/);
        const data = { posts: [], hotSearches: [], profiles: [] };
        
        let currentParsingMode = null; // null, 'comments', 'hot_search_items', 'profile_items'
        let currentPostObject = null; // To store the post being processed for comments

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // Check for main [Echo|...] directive lines
            const echoDirectiveMatch = trimmedLine.match(/^\[Echo\|([^|]+)\|([^|]+)\|(.*)\]$/);
            if (echoDirectiveMatch) {
                const id = echoDirectiveMatch[1].trim(); // Local ID like #E1, #HS01
                const type = echoDirectiveMatch[2].trim(); // echo_post, echo_hot_search:, echo_profile:
                const paramsString = echoDirectiveMatch[3];

                if (type === 'echo_post') {
                    currentParsingMode = 'comments';
                    const postParams = paramsString.split('|').map(p => p.trim());
                    currentPostObject = {
                        id: id, // #E1
                        authorName: postParams[0] || '匿名',
                        authorId: postParams[1] || '@unknown',
                        content: postParams[2] || '',
                        tags: postParams[3] || '',
                        stats: postParams[4] || '💬0 🔁0 ❤️0',
                        time: postParams[5] || '刚刚',
                        comments: []
                    };
                    data.posts.push(currentPostObject);
                    continue; // Move to next line
                } else if (type === 'echo_hot_search:') {
                    currentParsingMode = 'hot_search_items';
                    currentPostObject = null; // Not parsing a post anymore
                    continue; // This line is just a section marker
                } else if (type === 'echo_profile:') {
                    currentParsingMode = 'profile_items';
                    currentPostObject = null; // Not parsing a post anymore
                    continue; // This line is just a section marker
                }
                // If it's an [Echo|...] line but not a section starter, it might be an error or unused format
                // console.warn(`[EchoListeners] Unhandled [Echo|...] directive: ${trimmedLine}`);
            }

            // Check for item lines based on currentParsingMode
            const itemLineMatch = trimmedLine.match(/^#(\w\d*)\s*\|\s*(.*)$/); // Matches lines like "#1 | ...", "#c1 | ...", "#hs1 | ...", "#p1 | ..."
            if (itemLineMatch) {
                const itemLocalId = `#${itemLineMatch[1]}`; // e.g., #1, #c1, #hs1, #p1
                const itemParamsString = itemLineMatch[2];
                const itemParams = itemParamsString.split('|').map(p => p.trim());

                if (currentParsingMode === 'comments' && currentPostObject) {
                    if (itemParams.length >= 3) { // Name | @ID | Content | [Stats] | [Time]
                        currentPostObject.comments.push({
                            id: itemLocalId, // Local comment ID like #1, #2 from the example
                            commenterName: itemParams[0],
                            commenterId: itemParams[1],
                            text: itemParams[2],
                            stats: itemParams[3] || '',
                            time: itemParams[4] || '刚刚'
                        });
                    }
                } else if (currentParsingMode === 'hot_search_items') {
                    if (itemParams.length >= 3) { // EchoesCount | Term | Details
                        data.hotSearches.push({
                            id: itemLocalId, // Local hot search ID like #1, #2
                            count: itemParams[0],
                            term: itemParams[1],
                            details: itemParams[2]
                        });
                    }
                } else if (currentParsingMode === 'profile_items') {
                    if (itemParams.length >= 4) { // Name | @Username | Bio | Followers
                        data.profiles.push({
                            id: itemLocalId, // Local profile ID like #1, #2
                            name: itemParams[0],
                            username: itemParams[1],
                            bio: itemParams[2],
                            followers: itemParams[3]
                        });
                    }
                }
            }
        }
        // console.log("[EchoListeners] Final Parsed Echo Data:", JSON.stringify(data, null, 2));
        return data;
    }

    function renderEchoPosts(posts) {
        if (!echoTimelineTabContent) {
            console.warn("[EchoListeners] Timeline pane not found for rendering posts.");
            return;
        }
        
        if (echoLoadingTimeline) echoLoadingTimeline.style.display = 'none';
        echoTimelineTabContent.innerHTML = ''; // Clear previous posts

        if (!posts || posts.length === 0) {
            echoTimelineTabContent.innerHTML = '<div class="echo-loading-placeholder">沒有 Echo 帖子可顯示。</div>';
            if (echoLoadingTimeline) echoLoadingTimeline.style.display = 'block'; // Re-show placeholder if it exists
            return;
        }
        
        const fragment = document.createDocumentFragment();
        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'echo-post'; // Matches CSS class from improved-vn-panel.html

            // Avatar (placeholder for now)
            const avatarElement = document.createElement('div');
            avatarElement.className = 'post-avatar'; // Matches CSS
            // TODO: Add actual avatar image if available, e.g., from character data
            // avatarElement.innerHTML = `<img src="path/to/avatar/${post.echoId}.png" alt="${post.characterName}">`;
            postElement.appendChild(avatarElement);

            const postMainContent = document.createElement('div');
            postMainContent.className = 'post-content'; // Matches CSS

            // Header: Name, Username, Time
            const headerElement = document.createElement('div');
            headerElement.className = 'post-header'; // Matches CSS
            headerElement.innerHTML = `
                <strong class="post-name">${post.authorName || 'Unknown User'}</strong>
                <span class="post-username">${post.authorId || ''}</span>
                <span class="post-time">${post.time || ''}</span>
            `;
            postMainContent.appendChild(headerElement);

            // Text Content
            const textElement = document.createElement('div');
            textElement.className = 'post-text'; // Matches CSS
            textElement.innerHTML = (post.content || '').replace(/\n/g, '<br>'); // Handle newlines
            postMainContent.appendChild(textElement);

            // Image (if any)
            if (post.image) {
                const imageContainer = document.createElement('div');
                imageContainer.className = 'post-image-container'; // Matches CSS
                // Assuming post.image is a URL or a local path accessible by the panel
                // For local server, ensure the path is correct, e.g., /images/echo/${post.image}
                imageContainer.innerHTML = `<img src="${post.image}" alt="Echo Image"><span class="image-tag-overlay">圖片</span>`;
                postMainContent.appendChild(imageContainer);
            }
            // TODO: Add similar blocks for video and poll if their HTML structure is defined

            // Tags
            if (post.tags && post.tags.length > 0) {
                const tagsElement = document.createElement('div');
                tagsElement.className = 'post-tags'; // Matches CSS
                tagsElement.textContent = post.tags.join(' ');
                postMainContent.appendChild(tagsElement);
            }

            // Actions (Likes, Comments, Retweets) - Static display for now
            const actionsElement = document.createElement('div');
            actionsElement.className = 'post-actions'; // Matches CSS
            actionsElement.innerHTML = `
                <span class="post-action"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg> ${post.stats ? post.stats.split(' ')[3] : '0'}</span>
                <span class="post-action"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"></path></svg> ${post.stats ? post.stats.split(' ')[1] : '0'}</span>
                <span class="post-action"><svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg> ${post.stats ? post.stats.split(' ')[2] : '0'}</span>
            `;
            postMainContent.appendChild(actionsElement);

            // Comments Section
            if (post.comments && post.comments.length > 0) {
                const commentsSectionElement = document.createElement('div');
                commentsSectionElement.className = 'post-comments-section'; // Matches CSS
                post.comments.forEach(comment => {
                    const commentElement = document.createElement('div');
                    commentElement.className = 'comment-item'; // Matches CSS
                    commentElement.innerHTML = `
                        <strong class="comment-name">${comment.commenterName || 'User'}</strong> 
                        ${comment.commenterId ? `<span class="comment-username">${comment.commenterId}</span>` : ''}
                        <span class="comment-text">${(comment.text || '').replace(/\n/g, '<br>')}</span>
                        ${comment.time ? `<span class="comment-time"> · ${comment.time}</span>` : ''}
                        ${comment.stats ? `<span class="comment-likes"> · ❤️ ${comment.stats.split(' ')[3]}</span>` : ''}
                    `;
                    commentsSectionElement.appendChild(commentElement);
                });
                postMainContent.appendChild(commentsSectionElement);
            }
            
            postElement.appendChild(postMainContent);
            fragment.appendChild(postElement);
        });
        echoTimelineTabContent.appendChild(fragment);
    }

    function renderTrendingTopics(hotSearches) {
        if (!echoTrendingTabContent) return;
        if (echoLoadingTrending) echoLoadingTrending.style.display = 'none';
        echoTrendingTabContent.innerHTML = '';

        if (!hotSearches || hotSearches.length === 0) {
             echoTrendingTabContent.innerHTML = '<div class="echo-loading-placeholder">沒有熱搜趨勢可顯示。</div>';
             if (echoLoadingTrending) echoLoadingTrending.style.display = 'block';
            return;
        }
        const ul = document.createElement('ul');
        ul.className = 'trending-list'; // Add a class for styling
        hotSearches.forEach(topic => {
            const li = document.createElement('li');
            li.className = 'trending-item'; // Matches CSS
            li.innerHTML = `
                <div class="trending-category">${topic.id || 'Hot'}</div>
                <div class="trending-tag">${topic.term}</div>
                <div class="trending-count">${topic.count} echoes</div>
                ${topic.details ? `<div class="trending-details"><small>${topic.details}</small></div>` : ''}
            `;
            ul.appendChild(li);
        });
        echoTrendingTabContent.appendChild(ul);
    }

    function renderProfiles(profiles) {
        if (!echoProfileTabContent) return;
        if (echoLoadingProfile) echoLoadingProfile.style.display = 'none';
        echoProfileTabContent.innerHTML = '';

        if (!profiles || profiles.length === 0) {
            echoProfileTabContent.innerHTML = '<div class="echo-loading-placeholder">沒有用戶資料可顯示。</div>';
            if (echoLoadingProfile) echoLoadingProfile.style.display = 'block';
            return;
        }
        const container = document.createElement('div');
        container.className = 'profile-cards'; // Matches CSS
        profiles.forEach(profile => {
            const card = document.createElement('div');
            card.className = 'profile-card'; // Matches CSS
            // Placeholder for avatar
            const avatarHTML = `<div class="profile-avatar-display"><!-- Avatar Img Here --></div>`;
            card.innerHTML = `
                ${avatarHTML}
                <div class="profile-info-details">
                    <div class="profile-name-display">${profile.name || 'User'}</div>
                    <div class="profile-username-display">${profile.username || ''}</div>
                    <div class="profile-bio-display">${(profile.bio || '').replace(/\n/g, '<br>')}</div>
                    <div class="profile-followers-display">Followers: ${profile.followers || 0}</div>
                </div>
            `;
            container.appendChild(card);
        });
        echoProfileTabContent.appendChild(container);
    }

    function showEchoModal(echoDataString) {
        console.log('[EchoSystem.show] called with data:', echoDataString ? echoDataString.substring(0,100) + "..." : "No data");
        if (!echoModal) {
            console.error('[EchoListeners] Echo Modal DOM element not found!');
            return;
        }

        // Reset loading states and clear previous content
        [echoTimelineTabContent, echoTrendingTabContent, echoProfileTabContent].forEach(pane => {
            if (pane) pane.innerHTML = ''; // Clear content first
        });
        if(echoLoadingTimeline) { echoLoadingTimeline.textContent = '正在加載 Echo 時間線...'; echoLoadingTimeline.style.display = 'block'; if(echoTimelineTabContent) echoTimelineTabContent.appendChild(echoLoadingTimeline);}
        if(echoLoadingTrending) { echoLoadingTrending.textContent = '正在加載 Echo 熱搜...'; echoLoadingTrending.style.display = 'block'; if(echoTrendingTabContent) echoTrendingTabContent.appendChild(echoLoadingTrending);}
        if(echoLoadingProfile) { echoLoadingProfile.textContent = '正在加載 Echo 個人主頁...'; echoLoadingProfile.style.display = 'block'; if(echoProfileTabContent) echoProfileTabContent.appendChild(echoLoadingProfile);}

        const parsedData = parseEchoSection(echoDataString);
        console.log('[EchoSystem] Parsed Data for rendering:', JSON.parse(JSON.stringify(parsedData)));

        renderEchoPosts(parsedData.posts);
        renderTrendingTopics(parsedData.hotSearches);
        renderProfiles(parsedData.profiles);
        
        resetToDefaultTab();
        echoModal.classList.add('active');
    }

    function closeEchoModal() {
        if (echoModal) {
            echoModal.classList.remove('active');
        }
        console.log("[EchoListeners] Echo modal closed by user/system.");
        if (window.VNCore && typeof window.VNCore.echoModalWasClosed === 'function') {
            window.VNCore.echoModalWasClosed();
        } else {
            window.parent.postMessage({ type: 'ECHO_MODAL_CLOSED_FALLBACK' }, '*');
        }
    }
    
    document.addEventListener('DOMContentLoaded', () => {
        if (initializeDOMElements()) {
            setupEventListeners();
            console.log('[EchoListeners] Echo Modal System Initialized successfully (v2).');
        } else {
            console.error('[EchoListeners] Echo Modal System Initialization failed (v2).');
        }
    });

    window.EchoSystem = {
        show: showEchoModal,
        hide: closeEchoModal,
        parseEchoData: parseEchoSection 
    };
})();