// core/void/npc_decide.js
// 🎲 NPC 決策層：給「這個 NPC 現在的狀況」＋「他能做的幾件事」，回「下一步做哪件」。
//    只做決定，不寫台詞、不動小人；小人怎麼走由 lobby_stage.js 照答案去做。
//
//    走哪個模型：
//    - 她填了決策模型鑰匙 → 問 Jev（TypeSafe 的決策模型，經 Vercel AI Gateway）。
//      Jev 不生字，一次回三題：挑哪件事（附每件的機率）、心情幾分、會不會主動搭話（機率）。
//      「待在原地」不放進選項：放進去的話，只要選到一次，狀況寫著「上一步待在原地」，Jev 就給它九成以上，
//      永遠站著（09-23 實測）。多久想一次改由她在大廳設置填（分鐘），兩次之間他本來就站著。
//      挑哪件事照機率抽，不是永遠拿最高那個，NPC 才不會每次都做一樣的事。
//    - 沒填鑰匙，或 Jev 這一次失敗 → 改問副模型，只叫它回一個動作代號（task 'npc_decide'）。
//    送出去的只有狀況本身，不放鑰匙、不放她的私人資料。
(function () {
    'use strict';

    const KEY_LS = 'npc_decide_key';
    const ON_LS = 'npc_decide_on';
    const JEV_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
    const JEV_MODEL = 'typesafe-ai/jev';
    const MOODS = ['很差', '普通', '不錯', '很好'];
    const LOG_MAX = 20;
    const log = [];   // 最近幾次決定（DEBUG 執行框看：NPC_DECIDE.log）

    function getKey() { try { return (localStorage.getItem(KEY_LS) || '').trim(); } catch (e) { return ''; } }
    function setKey(v) { try { localStorage.setItem(KEY_LS, String(v || '').trim()); } catch (e) {} }
    function isOn() { try { return localStorage.getItem(ON_LS) !== '0'; } catch (e) { return true; } }
    function setOn(on) { try { localStorage.setItem(ON_LS, on ? '1' : '0'); } catch (e) {} }

    // 照機率抽一個；機率全 0 就回 null
    function _draw(probs) {
        const ks = Object.keys(probs || {});
        const total = ks.reduce((s, k) => s + (Number(probs[k]) || 0), 0);
        if (!(total > 0)) return null;
        let r = Math.random() * total;
        for (const k of ks) { r -= (Number(probs[k]) || 0); if (r <= 0) return k; }
        return ks[ks.length - 1];
    }

    async function _askJev(state, actions, key) {
        const name = state.name || '這個角色';
        const body = {
            model: JEV_MODEL,
            state,
            questions: {
                next_action: { type: 'choice', instructions: name + '接下來要做什麼？', criteria: actions },
                mood: { type: 'score', instructions: name + '現在心情多好？', criteria: MOODS },
                will_talk_to_player: { type: 'boolean', instructions: name + '會不會主動跟玩家說話？' },
            },
        };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        let res;
        try {
            res = await fetch(JEV_URL, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });
        } finally { clearTimeout(timer); }
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !data.answers) {
            const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
            throw new Error(msg);
        }
        const A = data.answers;
        const na = A.next_action || {};
        let action = _draw(na.probabilities) || na.choice;
        if (!Object.prototype.hasOwnProperty.call(actions, action)) action = na.choice;
        if (!Object.prototype.hasOwnProperty.call(actions, action)) throw new Error('回了清單外的動作：' + action);
        const sc = A.mood && typeof A.mood.score === 'number' ? A.mood.score : null;
        const pTalk = A.will_talk_to_player && typeof A.will_talk_to_player.probability === 'number' ? A.will_talk_to_player.probability : null;
        const gw = data.providerMetadata && data.providerMetadata.gateway;
        return {
            action,
            mood: sc == null ? null : MOODS[Math.max(0, Math.min(MOODS.length - 1, Math.round(sc)))],
            talk: pTalk == null ? null : Math.random() < pTalk,
            source: 'jev',
            detail: { probabilities: na.probabilities || null, moodScore: sc, talkProbability: pTalk },
            usage: data.usage || null,
            cost: gw ? { charged: gw.cost, market: gw.marketCost } : null,
        };
    }

    // 副模型頂替：只回一個動作代號；心情與搭話它不管（回 null，呼叫端沿用上一次的）
    function _askLlm(state, actions) {
        return new Promise((resolve, reject) => {
            if (!window.OS_API || !window.OS_SETTINGS) { reject(new Error('模型接口還沒載好')); return; }
            const sec = window.OS_SETTINGS.getSecondaryConfig ? window.OS_SETTINGS.getSecondaryConfig() : null;
            const config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : window.OS_SETTINGS.getConfig();
            const keys = Object.keys(actions);
            const list = keys.map(k => k + '：' + actions[k]).join('\n');
            const messages = [
                { role: 'system', content: '你在替一款遊戲裡的角色決定他的下一個動作。下面會給你這個角色現在的狀況（JSON），以及他能做的動作清單。依照角色的個性與狀況挑一個最自然的動作，只回那個動作的英文代號，不要加任何其他文字。' },
                { role: 'user', content: '角色狀況：\n' + JSON.stringify(state, null, 1) + '\n\n可以做的動作（代號：說明）：\n' + list + '\n\n只回一個代號。' },
            ];
            window.OS_API.chat(messages, config, null, (reply) => {
                const txt = String(reply || '');
                const hit = keys.filter(k => txt.indexOf(k) >= 0).sort((a, b) => txt.indexOf(a) - txt.indexOf(b))[0];
                if (!hit) { reject(new Error('副模型沒回清單裡的代號：' + txt.slice(0, 60))); return; }
                resolve({ action: hit, mood: null, talk: null, source: 'llm', detail: { reply: txt.slice(0, 120) }, usage: null, cost: null });
            }, reject, { task: 'npc_decide' });
        });
    }

    // state：純資料（名字、地點、時間、心情、上一個動作、玩家在哪、附近有誰…），由呼叫端組
    // actions：{ 代號: 中文說明 }
    async function decide(state, actions) {
        const t0 = Date.now();
        const key = getKey();
        let r = null, jevErr = null;
        if (key) {
            try { r = await _askJev(state, actions, key); }
            catch (e) { jevErr = (e && e.name === 'AbortError') ? '逾時' : String(e && e.message || e); }
        }
        if (!r) r = await _askLlm(state, actions);
        r.ms = Date.now() - t0;
        if (jevErr) r.jevError = jevErr;
        log.unshift({ at: new Date().toLocaleTimeString(), npc: state.name, state, result: r });
        if (log.length > LOG_MAX) log.length = LOG_MAX;
        return r;
    }

    window.NPC_DECIDE = { decide, getKey, setKey, isOn, setOn, log, MOODS };
})();
