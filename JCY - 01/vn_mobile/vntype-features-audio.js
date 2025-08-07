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

// 動態獲取素材設置的URL
function getSoundEffectBaseUrl() {
    if (window.VNMaterialProcessor?.getSoundEffectSettings) {
        const settings = window.VNMaterialProcessor.getSoundEffectSettings();
        return settings.baseUrl || 'https://nancywang3641.github.io/sound-files/sound_effect/';
    }
    return 'https://nancywang3641.github.io/sound-files/sound_effect/';
}

function getBgmBaseUrl() {
    if (window.VNMaterialProcessor?.getBgmSettings) {
        const settings = window.VNMaterialProcessor.getBgmSettings();
        return settings.baseUrl || 'https://nancywang3641.github.io/sound-files/bgm/';
    }
    return 'https://nancywang3641.github.io/sound-files/bgm/';
}

function getSoundEffectFormat() {
    if (window.VNMaterialProcessor?.getSoundEffectSettings) {
        const settings = window.VNMaterialProcessor.getSoundEffectSettings();
        return settings.format || '.mp3';
    }
    return '.mp3';
}

function getBgmFormat() {
    if (window.VNMaterialProcessor?.getBgmSettings) {
        const settings = window.VNMaterialProcessor.getBgmSettings();
        return settings.format || '.mp3';
    }
    return '.mp3';
}

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
    console.log('[VN面板-手机版-Features] 🔊 初始化音效池');
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
        console.log(`[VN面板-手机版-Features] 停止多音效组 ${groupId}`);
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
        // 使用動態音效URL
        const soundEffectUrl = getSoundEffectBaseUrl() + soundName + getSoundEffectFormat();
        playDynamicSound(soundEffectUrl, soundName);
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

    console.log(`[VN面板-手机版-Features] 开始播放多音效组 ${groupId}: [${groupInfo.sounds.join(', ')}]`);

    groupInfo.sounds.forEach((soundName, index) => {
        setTimeout(() => {
            if (activeMultiSounds.has(groupId)) {
                if (soundPools[soundName]) {
                    playSoundFromPool(soundName);
                } else {
                    // 使用動態音效URL
                    const soundEffectUrl = getSoundEffectBaseUrl() + soundName + getSoundEffectFormat();
                    playDynamicSound(soundEffectUrl, soundName);
                }
                console.log(`[VN面板-手机版-Features] 多音效组 ${groupId} 播放音效 [${index + 1}/${groupInfo.sounds.length}]: ${soundName}`);
            }
        }, index * 50);
    });

    setTimeout(() => {
        if (activeMultiSounds.has(groupId)) {
            activeMultiSounds.delete(groupId);
            console.log(`[VN面板-手机版-Features] 多音效组 ${groupId} 已自动清理`);
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
        console.log(`[VN面板-手机版-Features] 🔊 为动态音效创建音效池: ${soundName} (URL: ${url})`);
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

function updateBGM() {
    const vnData = window.VNCoreAPI.vnData;
    const bgmToPlay = vnData.sceneInfo?.bgm;
    if (vnData.sceneInfo?.hasOwnProperty('bgm')) { 
        setTimeout(() => playBGM(bgmToPlay || 'none'), 100); 
    }
}

function playBGM(bgmName) {
    if (bgmName === 'none') {
        if (currentBGM) fadeOutBGM(() => { currentBGM = null; currentBGMName = ''; showBgmStatus('BGM停止'); });
        return;
    }
    if (!bgmName || (bgmName === currentBGMName && currentBGM && !currentBGM.paused)) return; 

    // 使用動態BGM URL
    const url = getBgmBaseUrl() + bgmName + getBgmFormat();
    console.log(`[VN面板-手机版-Features] 🎵 尝试播放BGM: ${url}`);

    if (currentBGM) {
        fadeOutBGM(() => startNewBGM(url, bgmName));
    } else {
        startNewBGM(url, bgmName);
    }
}

function startNewBGM(url, bgmName) {
    showBgmStatus(`加载BGM: ${bgmName}... (GitHub)`);
    if (currentBGM) { 
        currentBGM.pause();
        currentBGM.src = ''; 
        currentBGM = null;
    }

    const newBGM = new Audio(url);
    newBGM.loop = true;
    newBGM.addEventListener('error', (e) => {
        bgmErrorCount++;
        console.error(`[VN面板-手机版-Features] 🎵 BGM加载失败: ${url}`, e);
        showBgmStatus(`加载BGM失败: ${bgmName}`, true);
    });

    newBGM.addEventListener('canplaythrough', () => {
        newBGM.volume = 0; 
        newBGM.play().then(() => {
            currentBGM = newBGM;
            currentBGMName = bgmName;
            fadeInBGM(); 
            showBgmStatus(`播放BGM: ${bgmName}`);
            bgmErrorCount = 0; 
            console.log(`[VN面板-手机版-Features] 🎵 BGM成功加载: ${bgmName}`);
        }).catch(error => {
            console.error(`[VN面板-手机版-Features/BGM] 播放BGM ${bgmName}出错:`, error.name, error.message);
            if (error.name === 'NotAllowedError') {
                showBgmStatus('需要用户交互才能播放BGM', true);
                currentBGM = newBGM; 
                currentBGMName = bgmName;
                const retryPlay = () => {
                    if (currentBGM === newBGM && newBGM.paused) { 
                        newBGM.play().then(() => { fadeInBGM(); showBgmStatus(`播放BGM: ${bgmName}`); })
                             .catch(err => { showBgmStatus('BGM播放失败', true);  });
                    }
                    document.removeEventListener('click', retryPlay, true);
                    document.removeEventListener('keydown', retryPlay, true);
                };
                document.addEventListener('click', retryPlay, { once: true, capture: true });
                document.addEventListener('keydown', retryPlay, { once: true, capture: true });
            } else {
                showBgmStatus('BGM播放失败', true);
            }
        });
    });
    if (newBGM.src && newBGM.src !== window.location.href) { 
      newBGM.load(); 
    } else if (!newBGM.src) {
        console.warn(`[VN面板-手机版-Features/BGM] BGM源"${bgmName}"为空或无效，BGM不会播放`);
        showBgmStatus(`BGM "${bgmName}"未找到`, true);
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
    if (!currentBGM || (currentBGM.paused && currentBGM.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)) {
        return;
    }
    if(currentBGM.volume < bgmVolume) performFade(currentBGM, bgmVolume);
}

function fadeOutBGM(callback) {
    if (!currentBGM) { if (callback) callback(); return; }
    const audioToFade = currentBGM; 
    performFade(audioToFade, 0, 1000, () => {
        audioToFade.pause();
        if (callback) callback();
    });
}

function forceStopCurrentBGM() {
    if (currentBGM) {
        try {
            currentBGM.pause();
            currentBGM.src = ''; 
        } catch (e) { /* ignore errors during forced stop */ }
        currentBGM = null;
        currentBGMName = '';
    }
}

function resetBGMSystem() {
    showBgmStatus('重置BGM...');
    forceStopCurrentBGM();
    setTimeout(() => {
        updateBGM();
    }, 250);
}

function showBgmStatus(message, isError = false) {
    if (!bgmStatusElement) createBgmStatusElement();
    if (!bgmStatusElement) return; 
    bgmStatusElement.textContent = message || (currentBGM && !currentBGM.paused ? `BGM: ${currentBGMName} (Vol: ${Math.round(bgmVolume*100)}%)` : '无BGM播放');
    bgmStatusElement.style.color = isError ? '#ff6b6b' : '#4cd137'; 
    bgmStatusElement.style.opacity = '1';
    setTimeout(() => { bgmStatusElement.style.opacity = '0'; }, 3000);
}

function setupBGMResetButtonListener() {
    const resetButton = document.getElementById('resetBgmButton');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            playSound('clickSound'); 
            resetBGMSystem();
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
            if (currentBGM) currentBGM.volume = bgmVolume;
            showBgmStatus(`BGM音量: ${e.target.value}%`);
        });
    }
}

// =======================================================================
//                            加載動畫 (手機版簡化)
// =======================================================================

function showLoadingAnimation() {
    console.log('[VN面板-手机版-Features] 显示全屏Loading动画');
    
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
    
    console.log('[VN面板-手机版-Features] 全屏Loading动画已显示');
}

function hideLoadingAnimation() {
    console.log('[VN面板-手机版-Features] 隐藏全屏Loading动画');
    
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
        
        console.log('[VN面板-手机版-Features] 全屏Loading动画已隐藏');
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
    console.log('[VN面板-手机版-Features] 初始化音频系统...');
    
    initSoundPools();
    createBgmStatusElement();
    setupBGMResetButtonListener();
    
    console.log('[VN面板-手机版-Features] 音频系统已初始化');
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
    
    // 多音效实用工具
    get activeMultiSounds() { return new Map(activeMultiSounds); },
    
    // 加载动画（手机版简化）
    showLoadingAnimation,
    hideLoadingAnimation,
    toggleLoadingAnimation,
    
    // 初始化函数
    initVNAudioFeatures
});

// 自动初始化（延迟执行确保DOM已加载）
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initVNAudioFeatures();
    }, 100);
});