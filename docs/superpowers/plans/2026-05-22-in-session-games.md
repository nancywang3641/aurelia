# 群聊區同 session 真・對弈 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓群聊區的 Claude / Codex 在自己的群聊 session 裡真的對弈 —— 用標記落子、自動多輪、有回合上限，玩完記得、能互嗆。

**Architecture:** 甲案 —— AI 當裁判靠 session 記憶持有棋局，畫布是純看板。AI 在群聊回覆裡吐 `[GAME]` / `[MOVE]` / `[GAMEOVER]` 標記；`ChatGroup` 偵測 `[GAME]` → 進遊戲模式跑自動多輪迴圈，每手經 `sendGroup`（resume）走 AI 各自的群聊 session，`[MOVE]` payload 餵 `ChatCanvas` 畫圖。

**Tech Stack:** 原生瀏覽器 JS（IIFE 模組，掛 `window.*`）、SillyTavern 第三方擴展。無測試框架 —— 每個任務以 `node --check` 驗語法，最後一個任務由 Rae 在酒館實玩驗收。

**設計來源：** `docs/superpowers/specs/2026-05-22-in-session-games-design.md`

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `core/chat_canvas.js` | 修改 | `LP` 接口：移除 `move`，加 `onMove` / `submitMove` / `gameEnd`；新增 `ChatCanvas.applyMove` |
| `core/chat_group.js` | 修改 | 標記解析 + 剝離 helper；`_runTurn` 回傳標記；遊戲模式 state + 自動多輪迴圈；`submitPlayerMove` / `endGame` |
| `core/claude_terminal.js` | 修改 | `GROUP_SYSTEM_PROMPT` 遊戲段改寫 |
| `css/chat_window.css` | 修改 | `.cg-system-line` 系統通知行樣式 |

---

## Task 1：chat_canvas.js — `LP` 接口換成遊戲版

**Files:**
- Modify: `core/chat_canvas.js`

- [ ] **Step 1：移除舊的 `LP.move`**

刪掉 `_makeChatPanelAPI()` 裡整個 `move:` 屬性（目前約 31-68 行，從 `// 回合制棋盤落子...` 註解到 `},` 結束那一塊）。`move` 走分 session、方向錯，整段拿掉。

- [ ] **Step 2：在模組頂部加落子回調的模組變數**

在 `let _tabEl = null;` 那行下面加一行：

```js
    let _onMoveCb = null;   // panel 透過 LP.onMove 註冊的落子顯示回調
```

- [ ] **Step 3：在 `_makeChatPanelAPI()` 的 return 物件裡，`close` 之後加三個遊戲接口**

`close: function () { ChatCanvas.close(); },` 那行之後加入：

```js

            // 遊戲：panel 註冊落子顯示回調。host 每有一手 → cb(payload, mover)
            onMove: function (cb) {
                _onMoveCb = (typeof cb === 'function') ? cb : null;
            },

            // 遊戲：panel 把使用者(Rae)的一手推進編排迴圈（不要自己畫，畫圖等 onMove 回呼）
            submitMove: function (payload) {
                if (window.ChatGroup && typeof window.ChatGroup.submitPlayerMove === 'function') {
                    window.ChatGroup.submitPlayerMove(String(payload == null ? '' : payload));
                }
            },

            // 遊戲：panel 偵測到勝負 → 收場
            gameEnd: function (resultText) {
                if (window.ChatGroup && typeof window.ChatGroup.endGame === 'function') {
                    window.ChatGroup.endGame(String(resultText == null ? '' : resultText));
                }
            },
```

- [ ] **Step 4：新增 `ChatCanvas.applyMove`**

在 `ChatCanvas.render = function ...` 那段之前（或之後）加入：

```js
    // ── 套用一手：host 抽到 [MOVE] / Rae 落子時呼叫，觸發 panel 註冊的 onMove 回調 ──
    ChatCanvas.applyMove = function (payload, mover) {
        if (typeof _onMoveCb === 'function') {
            try { _onMoveCb(payload, mover); }
            catch (e) { console.warn('[ChatCanvas] onMove 回調錯誤：', e); }
        }
    };
```

- [ ] **Step 5：`render` 與 `close` 重置 `_onMoveCb`**

在 `ChatCanvas.render` 函式內，`content.innerHTML = panelData.html || '';` 那行之前加一行（新 panel 換上來 → 舊回調作廢，等新 panel 的 JS 重新 `LP.onMove` 註冊）：

```js
        _onMoveCb = null;
```

在 `ChatCanvas.close` 函式內，`window.__CW_LP = null;` 那行之後加一行：

```js
        _onMoveCb = null;
```

- [ ] **Step 6：`close` 在對局中要中止對局**

在 `ChatCanvas.close` 函式最後（`_onMoveCb = null;` 之後）加入：

```js
        if (window.ChatGroup && typeof window.ChatGroup.endGame === 'function') {
            window.ChatGroup.endGame('（畫布關閉，對局中止）');
        }
```

`endGame` 在沒有對局進行時會自己 no-op，所以非遊戲 panel 關閉時呼叫也無害。

- [ ] **Step 7：驗證語法**

Run: `node --check core/chat_canvas.js`
Expected: 無輸出（語法正確）。

- [ ] **Step 8：Commit**

```bash
git add core/chat_canvas.js
git commit -m "群聊真對弈 task1：chat_canvas LP 換成遊戲接口"
```

---

## Task 2：chat_group.js — 標記解析 / 剝離 helper + 遊戲狀態變數

**Files:**
- Modify: `core/chat_group.js`

- [ ] **Step 1：加遊戲模式狀態變數**

在 `let _streamEl = null;` 那行之後加入：

```js
    let _game = null;             // 遊戲模式：{ players:[p1,p2], turnIdx, moveCount, raeResolver, endSignal }
    const GAME_TURN_LIMIT = 60;   // 安全閥：總手數上限，防無限迴圈 + 訂閱額度爆
```

- [ ] **Step 2：加標記解析與剝離 helper**

在 `_buildDelta` 函式之前加入：

```js
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
            .trim();
    }
```

- [ ] **Step 3：`_renderBubble` 顯示時剝掉標記**

`_renderBubble` 函式裡，把 `b.textContent = content;` 改成：

```js
        b.textContent = _stripForDisplay(content);
```

（transcript 存的是含標記的完整內容，但氣泡只該顯示閒聊文字。Rae 的訊息無標記，剝除為 no-op。）

- [ ] **Step 4：驗證語法**

Run: `node --check core/chat_group.js`
Expected: 無輸出。

- [ ] **Step 5：Commit**

```bash
git add core/chat_group.js
git commit -m "群聊真對弈 task2：chat_group 標記解析 helper + 狀態"
```

---

## Task 3：chat_group.js — 改造 `_runTurn` 回傳結構化標記

**Files:**
- Modify: `core/chat_group.js`

- [ ] **Step 1：整段替換 `_runTurn`**

把現有的 `_runTurn` 函式（從 `// ── 一個 AI 的回合...` 註解到函式結尾 `}`）整段換成：

```js
    // ── 一個 AI 的回合 ──
    // 回傳 { spoke:bool, failed:bool, markers:{game,move,gameover} }
    async function _runTurn(provider) {
        const delta = _buildDelta(provider);
        if (!delta.trim()) {
            _seen[provider] = _transcript.length - 1;
            return { spoke: false, failed: false, markers: {} };
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
            bubbleEl.textContent = displayText;
        }
        _transcript.push({ speaker: provider, content: transcriptText, ts: Date.now(), usage: result.usage || null });
        _seen[provider] = _transcript.length - 1;
        _save();
        return { spoke: true, failed: false, markers: markers };
    }
```

- [ ] **Step 2：修正 `sendUserMessage` 對 `_runTurn` 回傳值的用法（暫時版）**

`_runTurn` 現在回物件、不再回 boolean。`sendUserMessage` 目前是 `await _runTurn(order[0]); await _runTurn(order[1]);` —— 沒接回傳值，仍可運作。本步不改 `sendUserMessage`（Task 5 才接線）。確認 `sendUserMessage` 內沒有把 `_runTurn` 的回傳值當 boolean 用即可（目前確實沒有）。

- [ ] **Step 3：驗證語法**

Run: `node --check core/chat_group.js`
Expected: 無輸出。

- [ ] **Step 4：Commit**

```bash
git add core/chat_group.js
git commit -m "群聊真對弈 task3：_runTurn 回傳結構化標記 + 剝離規則"
```

---

## Task 4：chat_group.js — 遊戲引擎（迴圈 + 收場 + 對外接口）

**Files:**
- Modify: `core/chat_group.js`

- [ ] **Step 1：加系統通知行渲染 helper**

在 `_renderTyping` 函式之後加入：

```js
    // 系統通知行（置中、淡色，例如收場 / 中止）
    function _renderSystemLine(text) {
        if (!_streamEl) return;
        const d = document.createElement('div');
        d.className = 'cg-system-line';
        d.textContent = text;
        _streamEl.appendChild(d);
        _scrollBottom();
    }
```

- [ ] **Step 2：加遊戲迴圈與收場函式**

在 `ChatGroup.sendUserMessage` 函式之前加入：

```js
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
            const res = await _runTurn(mover);
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
```

注意：`_endGameInternal` 注入的「（系統）...」那條 transcript 不經 `_renderBubble`，所以不會顯示成氣泡 —— 它只用來餵兩個 AI 的 delta。

- [ ] **Step 3：加對外接口 `submitPlayerMove` / `endGame`**

在 `ChatGroup.isBusy = function ...` 那行之前加入：

```js
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
```

- [ ] **Step 4：驗證語法**

Run: `node --check core/chat_group.js`
Expected: 無輸出。

- [ ] **Step 5：Commit**

```bash
git add core/chat_group.js
git commit -m "群聊真對弈 task4：chat_group 遊戲迴圈 + 收場 + 對外接口"
```

---

## Task 5：chat_group.js — 接線（開局偵測 + `sendUserMessage` 分流 + `clear`）

**Files:**
- Modify: `core/chat_group.js`

- [ ] **Step 1：加開局偵測 `_maybeStartGame`**

在 `ChatGroup.sendUserMessage` 函式之前加入：

```js
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
```

- [ ] **Step 2：整段替換 `sendUserMessage`**

把現有的 `ChatGroup.sendUserMessage` 函式整段換成：

```js
    // ── 你發訊息 ──
    ChatGroup.sendUserMessage = async function (text) {
        if (!text || !text.trim()) return;

        // 遊戲進行中：Rae 的話只進 transcript + 渲染，不另起一輪
        // —— 跑著的遊戲迴圈會在下個 AI 回合的 delta 自然看到（能邊看邊嗆）
        if (_game) {
            _transcript.push({ speaker: 'rae', content: text, ts: Date.now() });
            _renderBubble('rae', text);
            _save();
            return;
        }

        if (_busy) return;
        _busy = true;
        try {
            _transcript.push({ speaker: 'rae', content: text, ts: Date.now() });
            _renderBubble('rae', text);
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
```

- [ ] **Step 3：`clear` 也要清遊戲狀態**

把現有的 `ChatGroup.clear` 函式整段換成：

```js
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
```

- [ ] **Step 4：驗證語法**

Run: `node --check core/chat_group.js`
Expected: 無輸出。

- [ ] **Step 5：Commit**

```bash
git add core/chat_group.js
git commit -m "群聊真對弈 task5：chat_group 開局偵測 + sendUserMessage 分流"
```

---

## Task 6：claude_terminal.js — `GROUP_SYSTEM_PROMPT` 遊戲段改寫

**Files:**
- Modify: `core/claude_terminal.js`

- [ ] **Step 1：替換 `GROUP_SYSTEM_PROMPT` 裡的「互動畫布」說明**

`GROUP_SYSTEM_PROMPT` 函式裡，目前有一段 `- 互動畫布：...` 的 bullet（含 `· LP.chat` / `· LP.move` / `· LP.image` / `· LP.close` 四行）。把那一整段 bullet（從 `- 互動畫布：` 到 `單純聊天不要用畫布；只有要互動 / 展示時才用。`）換成：

```js
- 互動畫布與遊戲：想下棋、玩回合制遊戲、做互動工具或展示網頁時，請「務必」用 <lobbyPanel> 產生真正可互動的畫面，「不要」用純文字或 ASCII 排版代替。格式：在回覆裡放一段 <lobbyPanel>{ "title":"標題", "html":"...", "css":"...", "js":"..." }</lobbyPanel>（必須是合法 JSON），它會渲染成群聊上方的畫布。panel 的 js 可調用 host 物件 LP：
  · LP.chat(文字, {provider:'claude'|'codex'}) → 問某個 AI、回字串
  · LP.image(描述) → 生圖、回 URL
  · LP.onMove((payload, mover) => { … }) → 註冊落子顯示回調；每有一手，host 會用該手的 payload 與下子方 mover 回呼，你在回呼裡把那一手畫到棋盤上
  · LP.submitMove(payload) → 若有玩家是使用者 Rae，把她在棋盤上的操作轉成這個呼叫（不要自己畫，畫圖一律等 onMove 回呼）
  · LP.gameEnd(講評文字) → 偵測到勝負時收場
  · LP.close() → 關畫布
- 開一局遊戲：在吐 <lobbyPanel> 的「同一則回覆」裡，加一個標記 [GAME|先手,後手]，先手 / 後手的值是 claude、codex 或 rae 三者之一（例：[GAME|claude,codex] 代表 Claude 先手、和 Codex 對弈）。並在閒聊裡把「落子格式」對對手講清楚。
- 輪到你下棋：回覆 =「一句閒聊（可以嗆對手）」+「一個 [MOVE|payload]」。payload 是你和對手約定好的落子內容（例：座標寫成 7,7）。payload 裡「不要」用 ] 這個字元。
- 對局結束：吐 [GAMEOVER|一句講評]。
- 棋局狀態靠你自己記 —— 你的群聊逐字稿裡有每一手。對局期間輪到你就一定要落子，不要回 [PASS]。
- 單純聊天不要用畫布；只有要互動 / 玩遊戲時才用。
```

- [ ] **Step 2：驗證語法**

Run: `node --check core/claude_terminal.js`
Expected: 無輸出。

- [ ] **Step 3：Commit**

```bash
git add core/claude_terminal.js
git commit -m "群聊真對弈 task6：群聊系統提示改寫成遊戲標記版"
```

---

## Task 7：css/chat_window.css — 系統通知行樣式 + 端到端驗收

**Files:**
- Modify: `css/chat_window.css`

- [ ] **Step 1：加 `.cg-system-line` 樣式**

在 `#aurelia-chat-window .cg-bubble.cg-error { ... }` 那條規則之後加入：

```css
#aurelia-chat-window .cg-system-line {
    align-self: center;
    text-align: center;
    font-size: 12px;
    color: #9a93a8;
    margin: 6px 0;
    padding: 0 16px;
}
```

- [ ] **Step 2：Commit**

```bash
git add css/chat_window.css
git commit -m "群聊真對弈 task7：群聊系統通知行樣式"
```

- [ ] **Step 3：端到端驗收（由 Rae 在酒館實玩）**

在 SillyTavern 重新載入擴展，開「👥 群聊區」，逐項確認：

1. **開局** —— 對群聊打「你們下盤井字棋」。某個 AI 回覆裡吐出 `<lobbyPanel>` → 上方畫布區展開、出現棋盤；該 AI 的氣泡只顯示閒聊文字，看不到 `[GAME]` / `[MOVE]` 等標記。
2. **自動多輪** —— 不必再打字，兩個 AI 自己一手接一手下，棋子陸續出現在畫布上，氣泡裡有互嗆。
3. **棋步同步** —— 後手 AI 的回應有針對前手的棋（證明它透過 delta 看到了對手的 `[MOVE]`）。
4. **收場** —— 分出勝負後出現「🏁 ...」系統行，接著兩個 AI 各講評一句，然後停下、回到一般群聊。
5. **賽後記憶** —— 對群聊打「剛剛那盤誰贏」，AI 答得出來（證明對局在它的 session 裡）。
6. **中止** —— 對局中按畫布的「✕ 關閉」→ 出現中止系統行、迴圈停下。
7. **Console** —— 全程 F12 主控台無紅字錯誤。

發現問題 → 回報，按 investigate 流程修。

---

## 自我檢查（已對 spec 核對）

- **spec §3.1 三標記** → Task 2 `_parseGameMarkers` 解析 `[GAME]`/`[MOVE]`/`[GAMEOVER]`。✅
- **spec §3.2 生命週期（開局/對弈/收場/講評）** → 開局 Task 5 `_maybeStartGame`；對弈 Task 4 `_runGameLoop`；收場 + 講評一輪 Task 4 `_endGameInternal`。✅
- **spec §3.3 自動多輪 + 回合上限 60 + Rae 暫停** → Task 4 `_runGameLoop`（`GAME_TURN_LIMIT`、`raeResolver` await）。✅
- **spec §3.3 遊戲中 Rae 仍能打字** → Task 5 `sendUserMessage` 的 `if (_game)` 分支。✅
- **spec §3.4 transcript 保留標記 / 顯示剝標記 / 不持久化** → Task 2 `_stripForTranscript` vs `_stripForDisplay`；`_game` 為記憶體變數。✅
- **spec §四 LP 改動（移除 move、加 onMove/submitMove/gameEnd、applyMove）** → Task 1。✅
- **spec §四 落子單一繪製路徑** → Task 1 `applyMove` → `_onMoveCb`；prompt（Task 6）要求 panel 不自己畫。✅
- **spec §五 系統提示改寫** → Task 6。✅
- **spec §七 錯誤處理**：沒落子中止 / cc-bridge 失敗中止 → Task 4 `_runGameLoop`；`LP.close` 中止 → Task 1 Step 6；回合上限通知 → Task 4。違規步不驗證 = 甲案刻意不做，無對應任務（正確）。✅
- **型別一致性**：`_runTurn` 回 `{spoke,failed,markers}` —— Task 3 定義、Task 4/5 消費，欄位名一致；`_game` 形狀 `{players,turnIdx,moveCount,raeResolver,endSignal}` —— Task 4/5 一致。✅

未發現缺漏。
