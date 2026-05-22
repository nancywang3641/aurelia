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
    let _game = null;             // 遊戲模式：{ players:[p1,p2], turnIdx, moveCount, raeResolver, endSignal }
    let _pendingAttachments = []; // 待送附件：{path,filename,mime,size,thumb} 或 {_uploading:true,filename,mime,size}
    const GAME_TURN_LIMIT = 60;   // 安全閥：總手數上限，防無限迴圈 + 訂閱額度爆

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

    // 把內容塞進氣泡：AI → markdown 渲染；Rae → 純文字。一律先剝遊戲標記。
    function _setBubbleContent(bubbleEl, speaker, content) {
        const clean = _stripForDisplay(content);
        if (speaker !== 'rae' && window.VoidClaudeRoom
            && typeof window.VoidClaudeRoom.markdownToSafeHtml === 'function') {
            const html = window.VoidClaudeRoom.markdownToSafeHtml(clean);
            if (html !== null && html !== undefined) {
                bubbleEl.innerHTML = html;
                bubbleEl.classList.add('claude-bubble-md');
                return;
            }
        }
        bubbleEl.textContent = clean;
    }

    function _renderBubble(speaker, content, attachments) {
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
        _setBubbleContent(b, speaker, content);

        // 附件：圖片 → 內嵌縮圖（點放大）；非圖 → 📎 chip
        if (Array.isArray(attachments) && attachments.length) {
            const box = document.createElement('div');
            box.className = 'cg-bubble-attachments';
            attachments.forEach(function (a) {
                if (a && a.thumb && a.mime && a.mime.indexOf('image/') === 0) {
                    const im = document.createElement('img');
                    im.className = 'cg-attach-img';
                    im.src = a.thumb;
                    im.addEventListener('click', function () { _openImageOverlay(a.thumb); });
                    box.appendChild(im);
                } else {
                    const chip = document.createElement('span');
                    chip.className = 'cg-attach-chip';
                    chip.textContent = '📎 ' + ((a && a.filename) || 'file');
                    box.appendChild(chip);
                }
            });
            b.appendChild(box);
        }

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

    // 系統通知行（置中、淡色，例如收場 / 中止）
    function _renderSystemLine(text) {
        if (!_streamEl) return;
        const d = document.createElement('div');
        d.className = 'cg-system-line';
        d.textContent = text;
        _streamEl.appendChild(d);
        _scrollBottom();
    }

    // 點縮圖 → 全螢幕放大 overlay（點任意處關閉）
    function _openImageOverlay(src) {
        const ov = document.createElement('div');
        ov.className = 'cg-img-overlay';
        const im = document.createElement('img');
        im.src = src;
        ov.appendChild(im);
        ov.addEventListener('click', function () {
            if (ov.parentNode) ov.parentNode.removeChild(ov);
        });
        document.body.appendChild(ov);
    }

    // 把圖檔縮到長邊 ≤ maxEdge、轉 JPEG base64 data URL。失敗回 null。
    function _makeThumb(file, maxEdge) {
        return new Promise(function (resolve) {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
                const scale = Math.min(1, maxEdge / Math.max(w, h));
                w = Math.max(1, Math.round(w * scale));
                h = Math.max(1, Math.round(h * scale));
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.82));
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    }

    // 待送附件 chip 列（重用浮窗既有的 #claude-attach-chips 容器）
    function _attachChipsEl() {
        const body = (window.ChatWindow && typeof window.ChatWindow.getBody === 'function')
            ? window.ChatWindow.getBody() : null;
        return body ? body.querySelector('#claude-attach-chips') : null;
    }

    function _renderPendingAttachments() {
        const row = _attachChipsEl();
        if (!row) return;
        row.innerHTML = '';
        _pendingAttachments.forEach(function (a, idx) {
            const chip = document.createElement('div');
            chip.className = 'cg-pending-chip' + (a._uploading ? ' cg-pending-uploading' : '');
            if (a.thumb) {
                const im = document.createElement('img');
                im.className = 'cg-pending-thumb';
                im.src = a.thumb;
                chip.appendChild(im);
            } else {
                const ic = document.createElement('span');
                ic.textContent = a._uploading ? '⏳' : '📎';
                chip.appendChild(ic);
            }
            const nm = document.createElement('span');
            nm.className = 'cg-pending-name';
            nm.textContent = a.filename || 'file';
            chip.appendChild(nm);
            const x = document.createElement('span');
            x.className = 'cg-pending-x';
            x.textContent = '×';
            x.addEventListener('click', function (e) {
                e.stopPropagation();
                _pendingAttachments.splice(idx, 1);
                _renderPendingAttachments();
            });
            chip.appendChild(x);
            row.appendChild(chip);
        });
    }

    /** 把整條 transcript 渲染進 streamEl（進群聊時用） */
    ChatGroup.hydrate = function (streamEl) {
        _streamEl = streamEl;
        _pendingAttachments = [];
        _renderPendingAttachments();
        if (!_streamEl) return;
        _streamEl.innerHTML = '';
        if (!_transcript.length) {
            _renderBubble('claude', '群聊區開張了 —— 你、Claude、Codex 三個人。說點什麼吧。');
            return;
        }
        _transcript.forEach(function (m) {
            // 系統注入提示、純標記行（如落子）剝完是空的 —— 不渲染
            if (m.speaker === 'rae' && m.content && m.content.indexOf('（系統）') === 0) return;
            const hasAtt = Array.isArray(m.attachments) && m.attachments.length;
            if (!_stripForDisplay(m.content) && !hasAtt) return;
            _renderBubble(m.speaker, m.content, m.attachments);
        });
    };

    // ── 遊戲標記解析 ──
    const RE_PANEL    = /<lobbyPanel>[\s\S]*?<\/lobbyPanel>/i;
    const RE_GAME     = /\[GAME\|\s*([a-z]+)\s*,\s*([a-z]+)\s*\]/i;
    const RE_MOVE     = /\[MOVE\|([^\]]*)\]/i;
    const RE_GAMEOVER = /\[GAMEOVER\|([^\]]*)\]/i;

    function _normPlayer(s) {
        s = (s || '').toLowerCase();
        return (s === 'claude' || s === 'codex' || s === 'rae') ? s : null;
    }

    // 解析回覆裡的遊戲標記。回 { game:{p1,p2}|null, move:string|null, gameover:string|null }
    function _parseGameMarkers(text) {
        const t = text || '';
        const g = t.match(RE_GAME);
        const m = t.match(RE_MOVE);
        const o = t.match(RE_GAMEOVER);
        let game = null;
        if (g) {
            const p1 = _normPlayer(g[1]), p2 = _normPlayer(g[2]);
            if (p1 && p2) game = { p1: p1, p2: p2 };
        }
        return {
            game: game,
            move: m ? m[1].trim() : null,
            gameover: o ? o[1].trim() : null,
        };
    }

    // 給對手看：剝掉 <lobbyPanel> 大 HTML（畫布已渲染、不重送），保留遊戲標記
    function _stripForTranscript(text) {
        return (text || '').replace(RE_PANEL, '').trim();
    }

    // 給氣泡顯示：剝掉 panel + 所有遊戲標記
    function _stripForDisplay(text) {
        return (text || '')
            .replace(RE_PANEL, '')
            .replace(RE_GAME, '')
            .replace(RE_MOVE, '')
            .replace(RE_GAMEOVER, '')
            .replace(/[ \t]+\n/g, '\n')      // 標記剝掉後行尾留的空白
            .replace(/\n{3,}/g, '\n\n')      // 標記剝掉後留下的空行 → 收斂成單一段落間距
            .trim();
    }

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

    // 跟 _buildDelta 同範圍：收集增量涵蓋的 rae 附件（去掉 thumb，cc-bridge 只要 path）
    function _collectDeltaAttachments(provider) {
        const out = [];
        for (let i = _seen[provider] + 1; i < _transcript.length; i++) {
            const m = _transcript[i];
            if (m.speaker === provider) continue;
            if (Array.isArray(m.attachments)) {
                m.attachments.forEach(function (a) {
                    if (a && a.path) out.push({ path: a.path, filename: a.filename, mime: a.mime, size: a.size });
                });
            }
        }
        return out;
    }

    // ── 一個 AI 的回合 ──
    // opts.gameTurn=true：遊戲回合，即使沒有新增量也要催它落子
    // 回傳 { spoke:bool, failed:bool, markers:{game,move,gameover} }
    async function _runTurn(provider, opts) {
        opts = opts || {};
        let delta = _buildDelta(provider);
        const deltaAttachments = _collectDeltaAttachments(provider);
        if (!delta.trim()) {
            if (!opts.gameTurn) {
                _seen[provider] = _transcript.length - 1;
                return { spoke: false, failed: false, markers: {} };
            }
            // 遊戲回合沒新增量（例：開局先手的第一手）→ 催落子
            delta = '（系統）輪到你下棋了，請依先前約定的格式落子。';
        }

        const typingWrap = _renderTyping(provider);
        const bubbleEl = typingWrap && typingWrap.querySelector('.cg-bubble');
        let acc = '';
        let result;
        try {
            result = await window.ClaudeTerminal.sendGroup({
                provider: provider,
                sessionId: _lsGet(_sidKey(provider)),
                userText: delta,
                attachments: deltaAttachments,
                onProgress: function (ev) {
                    if (ev && ev.type === 'text') {
                        acc = ev.accumulated || (acc + (ev.delta || ''));
                        if (bubbleEl) {
                            bubbleEl.classList.remove('cg-typing');
                            bubbleEl.textContent = _stripForDisplay(acc);
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
            // 送出失敗：不推進 _seen —— 下一輪再補送
            return { spoke: false, failed: true, markers: {} };
        }
        if (result.sessionId) _lsSet(_sidKey(provider), result.sessionId);

        const reply = (result.reply || '').trim();
        if (/^\[PASS\]$/i.test(reply)) {
            if (typingWrap && typingWrap.parentNode) typingWrap.parentNode.removeChild(typingWrap);
            _seen[provider] = _transcript.length - 1;
            return { spoke: false, failed: false, markers: {} };
        }

        const markers = _parseGameMarkers(result.reply);

        // <lobbyPanel> 畫布：永遠渲染（開局棋盤經此上來）
        if (window.VoidCanvas && typeof window.VoidCanvas.parseLobbyPanel === 'function') {
            const panel = window.VoidCanvas.parseLobbyPanel(result.reply);
            if (panel && window.ChatCanvas && typeof window.ChatCanvas.render === 'function') {
                window.ChatCanvas.render(panel);
            }
        }

        // 落子 → 餵畫布（只在遊戲模式中；開局首手由 _maybeStartGame 另外處理）
        if (markers.move != null && _game &&
            window.ChatCanvas && typeof window.ChatCanvas.applyMove === 'function') {
            window.ChatCanvas.applyMove(markers.move, provider);
        }

        if (result.usage && window.OS_SPEND_PANEL && typeof window.OS_SPEND_PANEL.record === 'function') {
            try { window.OS_SPEND_PANEL.record(result.usage); } catch (_) {}
        }

        const displayText = _stripForDisplay(result.reply);
        const transcriptText = _stripForTranscript(result.reply);

        if (!transcriptText) {
            // 整則只有 <lobbyPanel>、沒文字也沒標記：移掉空氣泡，不進 transcript
            if (typingWrap && typingWrap.parentNode) typingWrap.parentNode.removeChild(typingWrap);
            _seen[provider] = _transcript.length - 1;
            return { spoke: true, failed: false, markers: markers };
        }
        if (!displayText) {
            // 只有標記、沒閒聊文字：移掉氣泡，但 transcript 仍要記（對手要看到 [MOVE]）
            if (typingWrap && typingWrap.parentNode) typingWrap.parentNode.removeChild(typingWrap);
        } else if (bubbleEl) {
            bubbleEl.classList.remove('cg-typing');
            _setBubbleContent(bubbleEl, provider, result.reply);
        }
        _transcript.push({ speaker: provider, content: transcriptText, ts: Date.now(), usage: result.usage || null });
        _seen[provider] = _transcript.length - 1;
        _save();
        return { spoke: true, failed: false, markers: markers };
    }

    // ── 自動多輪遊戲迴圈 ──
    // _game 為 truthy 時運轉；用 _game.endSignal 統一收場。整個生命週期由本迴圈獨佔。
    async function _runGameLoop() {
        while (_game && !_game.endSignal) {
            if (_game.moveCount >= GAME_TURN_LIMIT) {
                _game.endSignal = { text: '已達回合上限 ' + GAME_TURN_LIMIT + ' 手，自動對弈停止。' };
                break;
            }
            const mover = _game.players[_game.turnIdx % 2];

            if (mover === 'rae') {
                // 輪到 Rae：暫停迴圈，等畫布捕捉點擊 → LP.submitMove → resolve
                const payload = await new Promise(function (resolve) { _game.raeResolver = resolve; });
                if (!_game) return;                       // 等待期間遊戲被清掉
                _game.raeResolver = null;
                if (_game.endSignal) break;               // 等待期間被收場
                if (payload == null) break;               // 中止信號
                if (window.ChatCanvas && typeof window.ChatCanvas.applyMove === 'function') {
                    window.ChatCanvas.applyMove(payload, 'rae');
                }
                _transcript.push({ speaker: 'rae', content: '[MOVE|' + payload + ']', ts: Date.now() });
                _save();
                _game.moveCount++;
                _game.turnIdx++;
                continue;
            }

            // 輪到 AI
            const res = await _runTurn(mover, { gameTurn: true });
            if (!_game) return;
            if (_game.endSignal) break;
            if (res.failed) {
                _game.endSignal = { text: LABEL[mover] + ' 連線失敗，對局中止。' };
                break;
            }
            if (res.markers && res.markers.gameover != null) {
                _game.endSignal = { text: res.markers.gameover };
                break;
            }
            if (res.markers && res.markers.move != null) {
                _game.moveCount++;
                _game.turnIdx++;
                continue;
            }
            // 該下棋卻沒落子也沒收場 → 中止（不重試，YAGNI）
            _game.endSignal = { text: LABEL[mover] + ' 這手沒有落子，對局中止。' };
            break;
        }
        const sig = _game && _game.endSignal;
        await _endGameInternal(sig ? sig.text : null);
    }

    // ── 收場：退出遊戲模式 + 收場講評一輪 ──
    async function _endGameInternal(resultText) {
        _game = null;
        if (resultText) _renderSystemLine('🏁 ' + resultText);

        // 收場講評一輪：注入系統提示進 transcript（不渲染這條），兩個 AI 各講評一句
        _transcript.push({
            speaker: 'rae',
            content: '（系統）這盤對局結束了。請用一句話講評，不要再落子、不要再輸出任何遊戲標記。',
            ts: Date.now(),
        });
        _save();
        const order = Math.random() < 0.5 ? ['claude', 'codex'] : ['codex', 'claude'];
        await _runTurn(order[0]);
        await _runTurn(order[1]);

        _busy = false;
    }

    // 偵測某回合的回覆是否開了一局遊戲。是 → 進遊戲模式、啟動迴圈、回 true
    function _maybeStartGame(mover, res) {
        if (_game || !res || !res.markers || !res.markers.game) return false;
        const g = res.markers.game;
        _game = { players: [g.p1, g.p2], turnIdx: 0, moveCount: 0, raeResolver: null, endSignal: null };
        // 開局回覆若已落第一手（且開局者就是先手）→ 算進去、補畫
        if (res.markers.move != null && mover === g.p1) {
            _game.turnIdx = 1;
            _game.moveCount = 1;
            if (window.ChatCanvas && typeof window.ChatCanvas.applyMove === 'function') {
                window.ChatCanvas.applyMove(res.markers.move, mover);
            }
        }
        _busy = true;   // 遊戲模式期間維持 busy，由 _endGameInternal 釋放
        _runGameLoop().catch(function (e) {
            console.error('[ChatGroup] 遊戲迴圈錯誤：', e);
            _game = null;
            _busy = false;
        });
        return true;
    }

    // ── 你發訊息 ──
    ChatGroup.sendUserMessage = async function (text) {
        text = text || '';
        const hasAtt = _pendingAttachments.some(function (a) { return a && a.path; });
        if (!text.trim() && !hasAtt) return;
        // 一般忙碌中（非遊戲）→ 擋，不動 pending，使用者可稍後重送
        if (!_game && _busy) return;

        // 快照待送附件（只取上傳完成、有 path 的），清空 pending
        const atts = _pendingAttachments
            .filter(function (a) { return a && a.path; })
            .map(function (a) {
                return { path: a.path, filename: a.filename, mime: a.mime, size: a.size, thumb: a.thumb || null };
            });
        _pendingAttachments = [];
        _renderPendingAttachments();

        const entry = { speaker: 'rae', content: text, ts: Date.now() };
        if (atts.length) entry.attachments = atts;

        // 遊戲進行中：只進 transcript + 渲染，不另起一輪（迴圈下個回合自然帶到）
        if (_game) {
            _transcript.push(entry);
            _renderBubble('rae', text, atts);
            _save();
            return;
        }

        _busy = true;
        try {
            _transcript.push(entry);
            _renderBubble('rae', text, atts);
            _save();

            // 兩個 AI 每次都拿到發言權，各自用 [PASS] 決定回不回；骰子只決定順序。
            const order = Math.random() < 0.5 ? ['claude', 'codex'] : ['codex', 'claude'];
            const r0 = await _runTurn(order[0]);
            if (_maybeStartGame(order[0], r0)) return;   // 開局了 → 交給遊戲迴圈
            const r1 = await _runTurn(order[1]);
            if (_maybeStartGame(order[1], r1)) return;
        } finally {
            // 進了遊戲模式則 _busy 維持 true（由 _endGameInternal 釋放）；否則放掉
            if (!_game) _busy = false;
        }
    };

    // ── 清空群聊（transcript + 兩條 session + 進行中的對局）──
    ChatGroup.clear = function () {
        if (_game) {
            // 中止進行中的對局：先解開可能卡住的 Rae await，再清狀態
            const g = _game;
            _game = null;
            if (typeof g.raeResolver === 'function') g.raeResolver(null);
        }
        _busy = false;
        _transcript = [];
        _seen = { claude: -1, codex: -1 };
        _lsSet(SID_CLAUDE, null);
        _lsSet(SID_CODEX, null);
        _save();
        if (_streamEl) ChatGroup.hydrate(_streamEl);
    };

    // 畫布(LP.submitMove)呼叫：把 Rae 的一手推進迴圈
    ChatGroup.submitPlayerMove = function (payload) {
        if (_game && typeof _game.raeResolver === 'function') {
            const r = _game.raeResolver;
            _game.raeResolver = null;
            r(String(payload == null ? '' : payload));
        }
    };

    // 畫布(LP.gameEnd / LP.close)呼叫：請求收場。設 endSignal，迴圈會自行收尾。
    ChatGroup.endGame = function (text) {
        if (!_game) return;
        _game.endSignal = { text: String(text == null ? '' : text) || '對局結束。' };
        // 若迴圈正等 Rae 落子 → 喚醒它，好讓它看到 endSignal 後退出
        if (typeof _game.raeResolver === 'function') {
            const r = _game.raeResolver;
            _game.raeResolver = null;
            r(null);
        }
    };

    // 選檔 → 上傳 cc-bridge + 圖檔做縮圖 → 進 _pendingAttachments
    ChatGroup.handleFilePick = async function (fileList) {
        if (!fileList || !fileList.length) return;
        if (!window.ClaudeTerminal || typeof window.ClaudeTerminal.uploadFiles !== 'function') {
            _renderSystemLine('⚠️ ClaudeTerminal 未載入，無法上傳。');
            return;
        }
        const baseIdx = _pendingAttachments.length;
        const files = Array.from(fileList);
        files.forEach(function (f) {
            _pendingAttachments.push({ _uploading: true, filename: f.name, mime: f.type || '', size: f.size });
        });
        _renderPendingAttachments();

        // 圖檔做縮圖（跟上傳並行）
        const thumbs = await Promise.all(files.map(function (f) {
            return (f.type && f.type.indexOf('image/') === 0) ? _makeThumb(f, 720) : Promise.resolve(null);
        }));

        try {
            const result = await window.ClaudeTerminal.uploadFiles(fileList);
            (result.files || []).forEach(function (meta, i) {
                _pendingAttachments[baseIdx + i] = {
                    path: meta.path, filename: meta.filename, mime: meta.mime, size: meta.size,
                    thumb: thumbs[i] || null,
                };
            });
        } catch (e) {
            _pendingAttachments.splice(baseIdx, files.length);
            _renderSystemLine('⚠️ 上傳失敗：' + ((e && e.message) || '未知錯誤'));
        }
        _renderPendingAttachments();
    };

    // 有沒有上傳完成、可送的附件（給 chat_window 的 submitInput 判斷純附件送出用）
    ChatGroup.hasPending = function () {
        return _pendingAttachments.some(function (a) { return a && a.path; });
    };

    ChatGroup.isBusy = function () { return _busy; };

    console.log('✅ ChatGroup（群聊區協調器）模組就緒');
})(window.ChatGroup = window.ChatGroup || {});
