/**
 * VN Type Features Audio - 手机版音频系统模块 v21.1
 * 
 * 包含: GitHub音频系统、BGM管理、音效播放、多音效处理
 */

// =======================================================================
//                            音頻系統全域變數
// =======================================================================

// GitHub音频系统URLs
const soundUrls = {
    pageFlipSound: 'https://files.catbox.moe/52ap3o.wav', 
    clickSound: 'https://files.catbox.moe/cwmtp6.wav',
    hoverSound: 'https://files.catbox.moe/kbiuxq.wav', 
    choiceSelectSound: 'https://files.catbox.moe/mlmu26.wav',
    messageSound: 'https://files.catbox.moe/cwmtp6.wav', 
    callSound: 'https://files.catbox.moe/52ap3o.wav',
    callEndSound: 'https://files.catbox.moe/mlmu26.wav', 
    chatSound: 'https://files.catbox.moe/cwmtp6.wav'
};

// 素材URL配置 - 可通過素材設置模組動態更新
let soundEffectBaseUrl = 'https://nancywang3641.github.io/sound-files/sound_effect/';
let bgmBaseUrl = 'https://nancywang3641.github.io/sound-files/bgm/';

const soundPools = {};
const POOL_SIZE = 5;
let currentBGM = null;
let currentBGMName = '';
let bgmVolume = 0.3;
const SOUND_EFFECT_MAX_DURATION = 10000;
const SOUND_EFFECT_FADE_OUT_DURATION = 1000;
let bgmErrorCount = 0;
let bgmStatusElement = null;

// 多音效管理状态
let activeMultiSounds = new Map();
let multiSoundCounter = 0;

// =======================================================================
//                            音頻系統初始化
// =======================================================================

function initSoundPools() {
    Object.entries(soundUrls).forEach(([soundName, url]) => {
        soundPools[soundName] = Array.from({ length: POOL_SIZE }, () => {
            const audio = new Audio(url);
            audio.preload = 'auto';
            return { audio, isPlaying: false, isFadingOut: false, timeoutId: null, fadeInterval: null };
        });
    });
    // console.log('[VN面板-手机版-Features] 🔊 使用GitHub URLs初始化音效池');
}

function createBgmStatusElement() {
    if (bgmStatusElement || !document.body) return; 
    bgmStatusElement = document.createElement('div');
    Object.assign(bgmStatusElement.style, {
        position: 'fixed', bottom: '10px', right: '10px', backgroundColor: 'rgba(0,0,0,0.7)',
        color: '#fff', padding: '5px 10px', borderRadius: '5px', fontSize: '12px',
        zIndex: '9999', transition: 'opacity 0.5s', opacity: '0', pointerEvents: 'none'
    });
    document.body.appendChild(bgmStatusElement);
}

// =======================================================================
//                            音效播放系統
// =======================================================================

function stopAllSounds() {
    const systemSounds = ['clickSound', 'pageFlipSound', 'hoverSound', 'choiceSelectSound', 'messageSound'];

    Object.entries(soundPools).forEach(([soundName, pool]) => {
        if (!pool || systemSounds.includes(soundName)) return; 
            pool.forEach(soundInstance => {
                if (soundInstance.isPlaying && !soundInstance.audio.paused) {
                if (soundInstance.timeoutId) clearTimeout(soundInstance.timeoutId);
                    soundInstance.audio.pause();
                    soundInstance.audio.currentTime = 0;
                    soundInstance.isPlaying = false;
                }
            });
    });

    for (const [groupId, groupInfo] of activeMultiSounds.entries()) {
        // console.log(`[VN面板-手机版-Features] 停止多音效组 ${groupId}`);
        groupInfo.sounds.forEach(soundName => {
            const pool = soundPools[soundName];
            if (pool) {
                pool.forEach(soundInstance => {
                    if (soundInstance.isPlaying && !soundInstance.audio.paused) {
                        if (soundInstance.timeoutId) clearTimeout(soundInstance.timeoutId);
                        soundInstance.audio.pause();
                        soundInstance.audio.currentTime = 0;
                        soundInstance.isPlaying = false;
                    }
                });
            }
        });
    }
    activeMultiSounds.clear();
}

function playSound(soundName) {
    if (!soundName || soundName === 'none') return;

    if (Array.isArray(soundName)) {
        playMultipleSounds(soundName);
        return;
    }

    if (soundPools[soundName]) {
        playSoundFromPool(soundName);
    } else {
        // 使用GitHub音效URL
        playDynamicSound(soundEffectBaseUrl + soundName + '.mp3', soundName);
    }
}

function playMultipleSounds(soundArray) {
    if (!Array.isArray(soundArray) || soundArray.length === 0) {
        console.warn('[VN面板-手机版-Features] playMultipleSounds: 无效的音效数组');
        return;
    }

    const groupId = `multi_sound_${++multiSoundCounter}`;
    const groupInfo = {
        sounds: soundArray.map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none'),
        startTime: Date.now()
    };

    if (groupInfo.sounds.length === 0) {
        console.warn('[VN面板-手机版-Features] playMultipleSounds: 没有有效的音效可播放');
        return;
    }

    activeMultiSounds.set(groupId, groupInfo);

    // console.log(`[VN面板-手机版-Features] 开始播放多音效组 ${groupId}: [${groupInfo.sounds.join(', ')}] (从GitHub获取)`);

    groupInfo.sounds.forEach((soundName, index) => {
        setTimeout(() => {
            if (activeMultiSounds.has(groupId)) {
                if (soundPools[soundName]) {
                    playSoundFromPool(soundName);
                } else {
                    // 使用GitHub音效URL
                    playDynamicSound(soundEffectBaseUrl + soundName + '.mp3', soundName);
                }
                // console.log(`[VN面板-手机版-Features] 多音效组 ${groupId} 播放音效 [${index + 1}/${groupInfo.sounds.length}]: ${soundName} (GitHub)`);
            }
        }, index * 50);
    });

    setTimeout(() => {
        if (activeMultiSounds.has(groupId)) {
            activeMultiSounds.delete(groupId);
            // console.log(`[VN面板-手机版-Features] 多音效组 ${groupId} 已自动清理`);
        }
    }, SOUND_EFFECT_MAX_DURATION + 1000);
}

function playSoundFromPool(soundName) {
    const pool = soundPools[soundName];
    if (!pool?.length) return;

    let soundInstance = pool.find(s => !s.isPlaying && (!s.isFadingOut || s.audio.paused)) || 
                        pool.find(s => !s.isFadingOut || s.audio.paused) || 
                        pool[0]; 

    if (soundInstance.timeoutId) clearTimeout(soundInstance.timeoutId);
    if (soundInstance.fadeInterval) clearInterval(soundInstance.fadeInterval);

    soundInstance.isPlaying = true;
    soundInstance.isFadingOut = false;
    soundInstance.audio.volume = 1; 
    soundInstance.audio.currentTime = 0; 

    soundInstance.audio.onended = () => {
        soundInstance.isPlaying = false;
        soundInstance.isFadingOut = false;
        if (soundInstance.timeoutId) clearTimeout(soundInstance.timeoutId);
        if (soundInstance.fadeInterval) clearInterval(soundInstance.fadeInterval);
    };

    const audioDuration = (soundInstance.audio.duration && isFinite(soundInstance.audio.duration)) ? soundInstance.audio.duration * 1000 : 2000; 
    const timeUntilFadeStart = Math.min(audioDuration, SOUND_EFFECT_MAX_DURATION) - SOUND_EFFECT_FADE_OUT_DURATION;

    if (timeUntilFadeStart > 0) {
        soundInstance.timeoutId = setTimeout(() => {
            if (soundInstance.isPlaying && !soundInstance.isFadingOut) {
                fadeOutSoundEffect(soundInstance, SOUND_EFFECT_FADE_OUT_DURATION);
            }
        }, timeUntilFadeStart);
    } else {
        const effectiveMaxPlayTime = Math.min(audioDuration, SOUND_EFFECT_MAX_DURATION);
        soundInstance.timeoutId = setTimeout(() => {
            if (soundInstance.isPlaying && !soundInstance.isFadingOut) {
                if (effectiveMaxPlayTime < SOUND_EFFECT_FADE_OUT_DURATION) {
                    setTimeout(() => {
                        if (!soundInstance.audio.paused) soundInstance.audio.pause();
                        soundInstance.isPlaying = false;
                        soundInstance.isFadingOut = false;
                    }, effectiveMaxPlayTime);
                } else {
                    fadeOutSoundEffect(soundInstance, SOUND_EFFECT_FADE_OUT_DURATION);
                }
            }
        }, Math.max(0, effectiveMaxPlayTime - SOUND_EFFECT_FADE_OUT_DURATION));
    }

    soundInstance.audio.play().catch(error => {
        console.error(`Error playing sound ${soundName}:`, error.message);
        soundInstance.isPlaying = false;
        soundInstance.isFadingOut = false;
        if (soundInstance.timeoutId) clearTimeout(soundInstance.timeoutId);
        if (soundInstance.fadeInterval) clearInterval(soundInstance.fadeInterval);
    });
}

function fadeOutSoundEffect(soundInstance, duration) {
    if (!soundInstance || !soundInstance.audio || soundInstance.isFadingOut || soundInstance.audio.paused) {
        return;
    }
    soundInstance.isFadingOut = true;
    if (soundInstance.timeoutId) clearTimeout(soundInstance.timeoutId); 

    performFade(soundInstance.audio, 0, duration, () => {
        if (!soundInstance.audio.paused) {
            soundInstance.audio.pause();
            soundInstance.audio.currentTime = 0;
        }
        soundInstance.isPlaying = false;
        soundInstance.isFadingOut = false;
        if (soundInstance.fadeInterval) clearInterval(soundInstance.fadeInterval); 
    });
}

function playDynamicSound(url, soundName) {
    if (!soundPools[soundName]) {
        soundPools[soundName] = Array.from({ length: 3 }, () => { 
            const audio = new Audio(url);
            audio.preload = 'auto';
            audio.onerror = (e) => {
                console.warn(`Failed to load dynamic sound: ${url}`, e);
                const instanceInPool = soundPools[soundName]?.find(s => s.audio === audio);
                if (instanceInPool) {
                    instanceInPool.isPlaying = false;
                    instanceInPool.isFadingOut = false;
                    if (instanceInPool.timeoutId) clearTimeout(instanceInPool.timeoutId);
                    if (instanceInPool.fadeInterval) clearInterval(instanceInPool.fadeInterval);
                }
            };
            return { audio, isPlaying: false, isFadingOut: false, timeoutId: null, fadeInterval: null };
        });
        // console.log(`[VN面板-手机版-Features] 🔊 为动态音效创建音效池: ${soundName} (GitHub: ${url})`);
    }
    playSoundFromPool(soundName); 
}

let hoverSoundThrottle = false;
function playHoverSound() {
    if (hoverSoundThrottle) return;
    playSound('hoverSound');
    hoverSoundThrottle = true;
    setTimeout(() => { hoverSoundThrottle = false; }, 100); 
}

// =======================================================================
//                            BGM背景音樂系統
// =======================================================================

// 🔥 新增：BGM狀態管理
let bgmState = {
    currentBGM: null,
    currentBGMName: '',
    isTransitioning: false,
    lastBGMUpdate: 0,
    errorCount: 0,
    maxRetries: 3
};

function updateBGM() {
    const vnData = window.VNCoreAPI.vnData;
    const bgmToPlay = vnData.sceneInfo?.bgm;
    const currentTime = Date.now();
    
    console.log(`[VN面板-手机版-Features] 🎵 更新BGM: ${bgmToPlay}, 當前BGM: ${bgmState.currentBGMName}, 狀態: ${bgmState.isTransitioning ? '切換中' : '穩定'}`);
    
    // 🔥 改進：防止重複更新
    if (bgmState.isTransitioning) {
        console.log(`[VN面板-手机版-Features] 🎵 BGM正在切換中，跳過更新`);
        return;
    }
    
    // 🔥 改進：防止過於頻繁的更新
    if (currentTime - bgmState.lastBGMUpdate < 100) {
        console.log(`[VN面板-手机版-Features] 🎵 BGM更新過於頻繁，跳過`);
        return;
    }
    
    bgmState.lastBGMUpdate = currentTime;
    
    if (vnData.sceneInfo?.hasOwnProperty('bgm')) { 
        setTimeout(() => playBGM(bgmToPlay || 'none'), 100); 
    }
}

// 🔥 改進：強制重置BGM狀態函數
function forceResetBGM() {
    console.log(`[VN面板-手机版-Features] 🎵 強制重置BGM狀態`);
    
    bgmState.isTransitioning = true;
    
    if (bgmState.currentBGM) {
        console.log(`[VN面板-手机版-Features] 🎵 停止當前BGM: ${bgmState.currentBGMName}`);
        try {
            bgmState.currentBGM.pause();
            bgmState.currentBGM.src = '';
            bgmState.currentBGM = null;
        } catch (e) {
            console.warn(`[VN面板-手机版-Features] 🎵 停止BGM時出現錯誤:`, e);
        }
    }
    
    bgmState.currentBGMName = '';
    bgmState.errorCount = 0;
    bgmState.isTransitioning = false;
    
    showBgmStatus('BGM已重置');
    console.log(`[VN面板-手机版-Features] 🎵 BGM狀態已重置`);
}

// 🔥 改進：強制切換BGM函數
function forceSwitchBGM(bgmName) {
    console.log(`[VN面板-手机版-Features] 🎵 強制切換BGM: ${bgmName}`);
    
    // 先重置狀態
    forceResetBGM();
    
    // 延遲一點時間再播放新BGM
    setTimeout(() => {
        playBGM(bgmName);
    }, 200);
}

// 🔥 改進：BGM播放函數
function playBGM(bgmName) {
    console.log(`[VN面板-手机版-Features] 🎵 嘗試播放BGM: ${bgmName}, 當前BGM: ${bgmState.currentBGMName}`);
    
    if (bgmState.isTransitioning) {
        console.log(`[VN面板-手机版-Features] 🎵 BGM正在切換中，跳過播放`);
        return;
    }
    
    if (bgmName === 'none') {
        if (bgmState.currentBGM) {
            fadeOutBGM(() => { 
                bgmState.currentBGM = null; 
                bgmState.currentBGMName = ''; 
                showBgmStatus('BGM停止'); 
            });
        }
        return;
    }
    
    if (!bgmName) {
        console.warn('[VN面板-手机版-Features] 🎵 BGM名稱為空，跳過播放');
        return;
    }
    
    // 🔥 改進：更精確的BGM切換判斷
    const shouldSwitchBGM = !bgmState.currentBGM || 
                           bgmState.currentBGMName !== bgmName || 
                           bgmState.currentBGM.paused || 
                           bgmState.currentBGM.ended ||
                           bgmState.currentBGM.error ||
                           bgmState.currentBGM.readyState < HTMLMediaElement.HAVE_METADATA;
    
    if (!shouldSwitchBGM) {
        console.log(`[VN面板-手机版-Features] 🎵 BGM ${bgmName} 已在播放，跳過切換`);
        return;
    }
    
    console.log(`[VN面板-手机版-Features] 🎵 切換BGM: ${bgmState.currentBGMName} -> ${bgmName}`);
    bgmState.isTransitioning = true;

    // 使用GitHub BGM URL
    const url = bgmBaseUrl + bgmName + '.mp3';
    console.log(`[VN面板-手机版-Features] 🎵 嘗試播放GitHub BGM: ${url}`);

    if (bgmState.currentBGM) {
        fadeOutBGM(() => startNewBGM(url, bgmName));
    } else {
        startNewBGM(url, bgmName);
    }
}

// 🔥 改進：開始新BGM函數
function startNewBGM(url, bgmName) {
    console.log(`[VN面板-手机版-Features] 🎵 開始加載新BGM: ${bgmName}`);
    showBgmStatus(`加載BGM: ${bgmName}... (GitHub)`);
    
    // 🔥 改進：確保清理舊的BGM狀態
    if (bgmState.currentBGM) { 
        console.log(`[VN面板-手机版-Features] 🎵 清理舊BGM: ${bgmState.currentBGMName}`);
        try {
            bgmState.currentBGM.pause();
            bgmState.currentBGM.src = ''; 
        } catch (e) {
            console.warn(`[VN面板-手机版-Features] 🎵 清理舊BGM時出現錯誤:`, e);
        }
        bgmState.currentBGM = null;
        bgmState.currentBGMName = '';
    }

    const newBGM = new Audio(url);
    newBGM.loop = true;
    
    // 🔥 改進：添加超時機制
    const loadTimeout = setTimeout(() => {
        if (bgmState.currentBGM === newBGM) {
            console.error(`[VN面板-手机版-Features] 🎵 BGM加載超時: ${bgmName}`);
            bgmState.errorCount++;
            showBgmStatus(`加載BGM超時: ${bgmName}`, true);
            
            if (bgmState.errorCount >= bgmState.maxRetries) {
                console.error(`[VN面板-手机版-Features] 🎵 BGM重試次數已達上限: ${bgmName}`);
                bgmState.currentBGM = null;
                bgmState.currentBGMName = '';
                bgmState.isTransitioning = false;
            }
        }
    }, 10000); // 10秒超時
    
    // 🔥 改進：添加更多事件監聽器
    newBGM.addEventListener('error', (e) => {
        clearTimeout(loadTimeout);
        bgmErrorCount++;
        bgmState.errorCount++;
        console.error(`[VN面板-手机版-Features] 🎵 BGM從GitHub加載失敗: ${url}`, e);
        showBgmStatus(`加載BGM失敗: ${bgmName} (GitHub)`, true);
        
        // 🔥 改進：錯誤時清理狀態
        if (bgmState.currentBGM === newBGM) {
            bgmState.currentBGM = null;
            bgmState.currentBGMName = '';
            bgmState.isTransitioning = false;
        }
    });

    newBGM.addEventListener('canplaythrough', () => {
        clearTimeout(loadTimeout);
        console.log(`[VN面板-手机版-Features] 🎵 BGM可以播放: ${bgmName}`);
        newBGM.volume = 0; 
        newBGM.play().then(() => {
            bgmState.currentBGM = newBGM;
            bgmState.currentBGMName = bgmName;
            bgmState.errorCount = 0;
            bgmState.isTransitioning = false;
            fadeInBGM(); 
            showBgmStatus(`播放BGM: ${bgmName} (GitHub)`);
            console.log(`[VN面板-手机版-Features] 🎵 BGM從GitHub成功加載: ${bgmName}`);
        }).catch(error => {
            console.error(`[VN面板-手机版-Features/BGM] 播放BGM ${bgmName}出錯:`, error.name, error.message);
            if (error.name === 'NotAllowedError') {
                showBgmStatus('需要用戶交互才能播放BGM', true);
                bgmState.currentBGM = newBGM; 
                bgmState.currentBGMName = bgmName;
                bgmState.isTransitioning = false;
                const retryPlay = () => {
                    if (bgmState.currentBGM === newBGM && newBGM.paused) { 
                        newBGM.play().then(() => { 
                            fadeInBGM(); 
                            showBgmStatus(`播放BGM: ${bgmName} (GitHub)`); 
                        }).catch(err => { 
                            showBgmStatus('BGM播放失敗', true);  
                        });
                    }
                    document.removeEventListener('click', retryPlay, true);
                    document.removeEventListener('keydown', retryPlay, true);
                };
                document.addEventListener('click', retryPlay, { once: true, capture: true });
                document.addEventListener('keydown', retryPlay, { once: true, capture: true });
            } else {
                showBgmStatus('BGM播放失敗', true);
                // 🔥 改進：播放失敗時清理狀態
                if (bgmState.currentBGM === newBGM) {
                    bgmState.currentBGM = null;
                    bgmState.currentBGMName = '';
                    bgmState.isTransitioning = false;
                }
            }
        });
    });
    
    // 🔥 改進：添加加載開始事件
    newBGM.addEventListener('loadstart', () => {
        console.log(`[VN面板-手机版-Features] 🎵 開始加載BGM: ${bgmName}`);
    });
    
    // 🔥 改進：添加加載進度事件
    newBGM.addEventListener('progress', () => {
        console.log(`[VN面板-手机版-Features] 🎵 BGM加載進度: ${bgmName}`);
    });
    
    if (newBGM.src && newBGM.src !== window.location.href) { 
        console.log(`[VN面板-手机版-Features] 🎵 開始加載BGM源: ${url}`);
        newBGM.load(); 
    } else if (!newBGM.src) {
        console.warn(`[VN面板-手机版-Features/BGM] BGM源"${bgmName}"為空或無效，BGM不會播放`);
        showBgmStatus(`BGM "${bgmName}"未找到 (GitHub)`, true);
        bgmState.isTransitioning = false;
    }
}

function performFade(audio, targetVolume, duration = 1000, onComplete) {
    if (!audio) { if (onComplete) onComplete(); return; }

    const stepTime = 50; 
    const initialVolume = audio.volume;
    const volumeChangePerStep = (targetVolume - initialVolume) / (duration / stepTime);

    if (audio.fadeInterval) clearInterval(audio.fadeInterval); 

    audio.fadeInterval = setInterval(() => {
        let newVolume = audio.volume + volumeChangePerStep;

        if ((volumeChangePerStep > 0 && newVolume >= targetVolume) || 
            (volumeChangePerStep < 0 && newVolume <= targetVolume) || 
            duration <= 0) { 
            newVolume = Math.max(0, Math.min(1, targetVolume)); 
            clearInterval(audio.fadeInterval);
            audio.fadeInterval = null;
            if (onComplete) onComplete();
        }
        try {
            audio.volume = newVolume;
        } catch (e) { 
            clearInterval(audio.fadeInterval);
            audio.fadeInterval = null;
            if (onComplete) onComplete();
        }
    }, stepTime);
}

function fadeInBGM() {
    if (!bgmState.currentBGM || (bgmState.currentBGM.paused && bgmState.currentBGM.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)) {
        return;
    }
    if(bgmState.currentBGM.volume < bgmVolume) performFade(bgmState.currentBGM, bgmVolume);
}

function fadeOutBGM(callback) {
    if (!bgmState.currentBGM) { if (callback) callback(); return; }
    const audioToFade = bgmState.currentBGM; 
    performFade(audioToFade, 0, 1000, () => {
        audioToFade.pause();
        if (callback) callback();
    });
}

// 🔥 改進：強制停止當前BGM函數
function forceStopCurrentBGM() {
    if (bgmState.currentBGM) {
        try {
            bgmState.currentBGM.pause();
            bgmState.currentBGM.src = ''; 
        } catch (e) { 
            console.warn(`[VN面板-手机版-Features] 🎵 強制停止BGM時出現錯誤:`, e);
        }
        bgmState.currentBGM = null;
        bgmState.currentBGMName = '';
        bgmState.isTransitioning = false;
    }
}

// 🔥 新增：強制停止BGM函數（供外部調用）
function forceStopBGM() {
    console.log(`[VN面板-手机版-Features] 🎵 外部調用強制停止BGM`);
    bgmState.isTransitioning = true;
    forceStopCurrentBGM();
    bgmState.isTransitioning = false;
    showBgmStatus('BGM已強制停止');
}

// 🔥 改進：重置BGM系統函數
function resetBGMSystem() {
    console.log(`[VN面板-手机版-Features] 🎵 重置BGM系統`);
    showBgmStatus('重置BGM... (GitHub)');
    bgmState.isTransitioning = true;
    forceStopCurrentBGM();
    bgmState.errorCount = 0;
    setTimeout(() => {
        bgmState.isTransitioning = false;
        updateBGM();
    }, 250);
}

function showBgmStatus(message, isError = false) {
    if (!bgmStatusElement) createBgmStatusElement();
    if (!bgmStatusElement) return; 
    bgmStatusElement.textContent = message || (bgmState.currentBGM && !bgmState.currentBGM.paused ? `BGM: ${bgmState.currentBGMName} (Vol: ${Math.round(bgmVolume*100)}%, GitHub)` : '无BGM播放');
    bgmStatusElement.style.color = isError ? '#ff6b6b' : '#4cd137'; 
    bgmStatusElement.style.opacity = '1';
    setTimeout(() => { bgmStatusElement.style.opacity = '0'; }, 3000);
}

function setupBGMResetButtonListener() {
    const resetButton = document.getElementById('resetBgmButton');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            playSound('clickSound'); 
            forceResetBGM();
        });
    }
    
    const bgmVolumeSlider = document.querySelector('#bgmVolumeSlider');
    const bgmVolumeValueEl = document.querySelector('#bgmVolumeValue');
    if (bgmVolumeSlider && bgmVolumeValueEl) {
        bgmVolumeSlider.value = bgmVolume * 100;
        bgmVolumeValueEl.textContent = Math.round(bgmVolume * 100);
        bgmVolumeSlider.addEventListener('input', (e) => {
            bgmVolume = parseInt(e.target.value) / 100;
            bgmVolumeValueEl.textContent = e.target.value;
            if (bgmState.currentBGM) bgmState.currentBGM.volume = bgmVolume;
            showBgmStatus(`BGM音量: ${e.target.value}% (GitHub)`);
        });
    }
    
    // 🔥 新增：添加鍵盤快捷鍵重置BGM (Ctrl+Shift+R)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'R') {
            console.log('[VN面板-手机版-Features] 用戶按下BGM重置快捷鍵 (Ctrl+Shift+R)');
            e.preventDefault();
            forceResetBGM();
        }
    });
}

// =======================================================================
//                            加載動畫 (手機版簡化)
// =======================================================================

function showLoadingAnimation() {
    // console.log('[VN面板-手机版-Features] 显示全屏Loading动画');
    
    const fullscreenLoading = document.getElementById('fullscreen-loading-overlay');
    if (!fullscreenLoading) {
        console.warn("[VN面板-手机版-Features] fullscreen-loading-overlay未找到");
        return;
    }
    
    // 更新loading文字（手机版简化）
    const loadingText = fullscreenLoading.querySelector('.fullscreen-loading-text');
    if (loadingText) {
        loadingText.textContent = '⏳ AI 思考中...';
    }
    
    // 显示全屏loading
    fullscreenLoading.classList.add('active');
    
    // 处理GIF加载失败的情况
    const loadingGif = fullscreenLoading.querySelector('.fullscreen-loading-gif');
    if (loadingGif) {
        loadingGif.onerror = () => {
            console.warn('[VN面板-手机版-Features] loading.gif加载失败，隐藏图片');
            loadingGif.style.display = 'none';
            if (loadingText) {
                loadingText.textContent = '⏳ AI 思考中...';
                loadingText.style.fontSize = '20px';
            }
        };
    }
    
    // 🔥 新增：通知VN處理器啟用（loading狀態）
    try {
        if (window.top && window.top.VNProcessor && typeof window.top.VNProcessor.enableVNProcessor === 'function') {
            window.top.VNProcessor.enableVNProcessor();
            console.log('[VN面板-手机版-Features] ✅ Loading狀態：已啟用VN處理器');
        }
    } catch (error) {
        console.error('[VN面板-手机版-Features] Loading狀態啟用VN處理器失敗:', error);
    }
    
    // console.log('[VN面板-手机版-Features] 全屏Loading动画已显示');
}

function hideLoadingAnimation() {
    // console.log('[VN面板-手机版-Features] 隐藏全屏Loading动画');
    
    const fullscreenLoading = document.getElementById('fullscreen-loading-overlay');
    if (!fullscreenLoading) {
        console.warn("[VN面板-手机版-Features] fullscreen-loading-overlay未找到");
        return;
    }
    
    if (fullscreenLoading.classList.contains('active')) {
        fullscreenLoading.classList.remove('active');
        
        // 重置GIF显示状态
        const loadingGif = fullscreenLoading.querySelector('.fullscreen-loading-gif');
        if (loadingGif) {
            loadingGif.style.display = 'block';
        }
        
        // 🔥 新增：通知VN處理器禁用（loading結束）
        try {
            if (window.top && window.top.VNProcessor && typeof window.top.VNProcessor.disableVNProcessor === 'function') {
                window.top.VNProcessor.disableVNProcessor();
                console.log('[VN面板-手机版-Features] ❌ Loading結束：已禁用VN處理器');
            }
        } catch (error) {
            console.error('[VN面板-手机版-Features] Loading結束禁用VN處理器失敗:', error);
        }
        
        // console.log('[VN面板-手机版-Features] 全屏Loading动画已隐藏');
    }
}

function toggleLoadingAnimation() {
    const dialogBoxGlobalRef = window.VNCoreAPI.dialogBoxGlobalRef;
    if (!dialogBoxGlobalRef) return;
    
    const currentLoadingContainer = dialogBoxGlobalRef.querySelector('.dialog-loading-container');
    if (currentLoadingContainer && currentLoadingContainer.classList.contains('active')) {
        hideLoadingAnimation();
    } else {
        showLoadingAnimation();
    }
}

// =======================================================================
//                            全域導出
// =======================================================================

// 初始化音频系统
function initVNAudioFeatures() {
    // console.log('[VN面板-手机版-Features] 初始化音频系统...');
    
    initSoundPools();
    createBgmStatusElement();
    setupBGMResetButtonListener();
    
    // 嘗試從素材設置模組獲取配置
    if (window.MaterialSettings) {
        const config = window.MaterialSettings.getCurrentMaterialConfig();
        if (config.soundEffect) {
            soundEffectBaseUrl = config.soundEffect.baseUrl;
            // console.log('[VN面板-手机版-Features] 🔊 已從素材設置載入音效URL:', soundEffectBaseUrl);
        }
        if (config.bgm) {
            bgmBaseUrl = config.bgm.baseUrl;
            // console.log('[VN面板-手机版-Features] 🔊 已從素材設置載入BGM URL:', bgmBaseUrl);
        }
    }
    
    // console.log('[VN面板-手机版-Features] 音频系统已初始化，使用GitHub音频资源');
}

// 更新素材URL的函數
function updateAudioMaterialUrls(newSoundEffectUrl, newBgmUrl) {
    if (newSoundEffectUrl) {
        soundEffectBaseUrl = newSoundEffectUrl;
        // console.log('[VN面板-手机版-Features] 🔊 音效URL已更新:', soundEffectBaseUrl);
    }
    if (newBgmUrl) {
        bgmBaseUrl = newBgmUrl;
        // console.log('[VN面板-手机版-Features] 🔊 BGM URL已更新:', bgmBaseUrl);
    }
}

// 添加到全局VNFeatures
if (!window.VNFeatures) window.VNFeatures = {};

Object.assign(window.VNFeatures, {
    // 音频功能（增强版）
    playSound,
    stopAllSounds,
    playMultipleSounds,
    playBGM,
    forceStopBGM: forceStopCurrentBGM,
    updateBGM,
    showBgmStatus,
    playHoverSound,
    
    // 🔥 新增：BGM狀態管理函數
    forceResetBGM,
    forceSwitchBGM,
    
    // 多音效实用工具
    get activeMultiSounds() { return new Map(activeMultiSounds); },
    
    // 加载动画（手机版简化）
    showLoadingAnimation,
    hideLoadingAnimation,
    toggleLoadingAnimation,
    
    // 素材URL更新
    updateAudioMaterialUrls,
    
    // 初始化函数
    initVNAudioFeatures
});

// 自动初始化（延迟执行确保DOM已加载）
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initVNAudioFeatures();
    }, 100);
});