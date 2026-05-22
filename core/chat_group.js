/**
 * core/chat_group.js — Claude × Codex 群聊區協調器
 * 你 / Claude / Codex 三方同一聊天室。骰子決定誰拿發言權、可 [PASS]。
 * 傳話人模型：Claude / Codex 各自獨立 session，協調器互相轉述。
 */
(function (ChatGroup) {
    'use strict';

    const STORE_KEY  = 'group_chat_main';     // OS_DB transcript
    const SID_CLAUDE = 'group_claude_sid';    // localStorage
    const SID_CODEX  = 'group_codex_sid';
    const LABEL = { rae: 'Rae', claude: 'Claude', codex: 'Codex' };

    let _transcript = [];   // [{ speaker:'rae'|'claude'|'codex', content, ts, usage? }]
    let _seen = { claude: -1, codex: -1 };  // 各 AI 已被送到第幾則 transcript index
    let _busy = false;
    let _streamEl = null;   // 渲染目標（窗內 chat-stream）

    function _lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
    function _lsSet(k, v) {
        try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {}
    }
    function _sidKey(p) { return p === 'codex' ? SID_CODEX : SID_CLAUDE; }

    function _save() {
        if (window.OS_DB && typeof window.OS_DB.saveStudioChat === 'function') {
            window.OS_DB.saveStudioChat(STORE_KEY, _transcript).catch(() => {});
        }
    }

    // ── 載入 ──
    ChatGroup.load = async function () {
        _transcript = [];
        if (window.OS_DB && typeof window.OS_DB.getStudioChat === 'function') {
            try {
                const m = await window.OS_DB.getStudioChat(STORE_KEY);
                if (Array.isArray(m)) _transcript = m;
            } catch (_) {}
        }
        // 兩個 AI 的 session 已續到上次存檔點 → seen 設為 transcript 末端
        _seen.claude = _transcript.length - 1;
        _seen.codex  = _transcript.length - 1;
    };

    // ── 渲染 ──
    function _scrollBottom() { if (_streamEl) _streamEl.scrollTop = _streamEl.scrollHeight; }

    function _renderBubble(speaker, content) {
        if (!_streamEl) return null;
        const wrap = document.createElement('div');
        wrap.className = 'cg-bubble-wrap cg-from-' + speaker;
        if (speaker !== 'rae') {
            const hdr = document.createElement('div');
            hdr.className = 'cg-bubble-hdr cg-hdr-' + speaker;
            hdr.textContent = (speaker === 'codex' ? '🔷 Codex' : '🦀 Claude');
            wrap.appendChild(hdr);
        }
        const b = document.createElement('div');
        b.className = 'cg-bubble cg-from-' + speaker;
        b.textContent = content;
        wrap.appendChild(b);
        _streamEl.appendChild(wrap);
        _scrollBottom();
        return b;
    }

    function _renderTyping(speaker) {
        if (!_streamEl) return null;
        const wrap = document.createElement('div');
        wrap.className = 'cg-bubble-wrap cg-from-' + speaker;
        const hdr = document.createElement('div');
        hdr.className = 'cg-bubble-hdr cg-hdr-' + speaker;
        hdr.textContent = (speaker === 'codex' ? '🔷 Codex' : '🦀 Claude');
        const b = document.createElement('div');
        b.className = 'cg-bubble cg-from-' + speaker + ' cg-typing';
        b.textContent = '正在輸入…';
        wrap.appendChild(hdr);
        wrap.appendChild(b);
        _streamEl.appendChild(wrap);
        _scrollBottom();
        return wrap;
    }

    /** 把整條 transcript 渲染進 streamEl（進群聊時用） */
    ChatGroup.hydrate = function (streamEl) {
        _streamEl = streamEl;
        if (!_streamEl) return;
        _streamEl.innerHTML = '';
        if (!_transcript.length) {
            _renderBubble('claude', '群聊區開張了 —— 你、Claude、Codex 三個人。說點什麼吧。');
            return;
        }
        _transcript.forEach(m => _renderBubble(m.speaker, m.content));
    };

    // ── 傳話增量：transcript 自 _seen[provider] 之後、非該 provider 自己的話 ──
    function _buildDelta(provider) {
        const lines = [];
        for (let i = _seen[provider] + 1; i < _transcript.length; i++) {
            const m = _transcript[i];
            if (m.speaker === provider) continue;  // 它自己的話已在它 session 裡
            lines.push('[' + LABEL[m.speaker] + ']: ' + m.content);
        }
        return lines.join('\n\n');
    }

    // ── 一個 AI 的回合：回傳 true=講了話 / false=PASS 或失敗 ──
    async function _runTurn(provider) {
        const delta = _buildDelta(provider);
        if (!delta.trim()) { _seen[provider] = _transcript.length - 1; return false; }

        const typingWrap = _renderTyping(provider);
        const bubbleEl = typingWrap && typingWrap.querySelector('.cg-bubble');
        let acc = '';
        let result;
        try {
            result = await window.ClaudeTerminal.sendGroup({
                provider: provider,
                sessionId: _lsGet(_sidKey(provider)),
                userText: delta,
                onProgress: function (ev) {
                    if (ev && ev.type === 'text') {
                        acc = ev.accumulated || (acc + (ev.delta || ''));
                        if (bubbleEl) {
                            bubbleEl.classList.remove('cg-typing');
                            bubbleEl.textContent = acc;
                            _scrollBottom();
                        }
                    }
                },
            });
        } catch (e) {
            if (bubbleEl) {
                bubbleEl.classList.remove('cg-typing');
                bubbleEl.classList.add('cg-error');
                bubbleEl.textContent = '⚠️ ' + ((e && e.message) || '送出失敗');
            }
            // 送出失敗：不推進 _seen —— 這個 AI 沒真的收到增量，下一輪再補送
            return false;
        }
        if (result.sessionId) _lsSet(_sidKey(provider), result.sessionId);

        const reply = (result.reply || '').trim();
        if (/^\[PASS\]$/i.test(reply)) {
            // 略過：移掉氣泡。它看過增量了 → 推進 _seen
            if (typingWrap && typingWrap.parentNode) typingWrap.parentNode.removeChild(typingWrap);
            _seen[provider] = _transcript.length - 1;
            return false;
        }
        if (bubbleEl) {
            bubbleEl.classList.remove('cg-typing');
            bubbleEl.textContent = result.reply;
        }
        _transcript.push({ speaker: provider, content: result.reply, ts: Date.now(), usage: result.usage || null });
        _seen[provider] = _transcript.length - 1;
        if (result.usage && window.OS_SPEND_PANEL && typeof window.OS_SPEND_PANEL.record === 'function') {
            try { window.OS_SPEND_PANEL.record(result.usage); } catch (_) {}
        }
        _save();
        return true;
    }

    // ── 你發訊息 → 骰子編排 ──
    ChatGroup.sendUserMessage = async function (text) {
        if (_busy || !text || !text.trim()) return;
        _busy = true;
        try {
            _transcript.push({ speaker: 'rae', content: text, ts: Date.now() });
            _renderBubble('rae', text);
            _save();

            const first  = Math.random() < 0.5 ? 'claude' : 'codex';
            const second = first === 'claude' ? 'codex' : 'claude';

            const firstSpoke = await _runTurn(first);
            // 第二位：~70% 機率；第一位沒講（PASS / 失敗）→ 100% 保證輪到，不冷場
            if (!firstSpoke || Math.random() < 0.7) {
                await _runTurn(second);
            }
        } finally {
            _busy = false;
        }
    };

    // ── 清空群聊（transcript + 兩條 session）──
    ChatGroup.clear = function () {
        _transcript = [];
        _seen = { claude: -1, codex: -1 };
        _lsSet(SID_CLAUDE, null);
        _lsSet(SID_CODEX, null);
        _save();
        if (_streamEl) ChatGroup.hydrate(_streamEl);
    };

    ChatGroup.isBusy = function () { return _busy; };

    console.log('✅ ChatGroup（群聊區協調器）模組就緒');
})(window.ChatGroup = window.ChatGroup || {});
