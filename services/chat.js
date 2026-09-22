'use strict';
/*
 * 🧬 MeR~NeL — services/chat.js
 * Mode discussion automatique (Xchat on/off) via le proxy Gemini.
 * Contexte contrôlé : historique court par thread + verrou anti-spam
 * pour éviter toute consommation excessive de l'API.
 */

const config = require('../core/config');

function createChatService(logger) {
  /** Map<threadID, [{name, text, reply}]> */
  const contexts = new Map();
  /** Un seul appel à la fois par thread. */
  const locks = new Set();

  function typedError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  function buildPrompt(threadID, userName, text) {
    const history = (contexts.get(threadID) || [])
      .slice(-config.chat.contextTurns)
      .flatMap((h) => [`Utilisateur ${h.name} : ${h.text}`, `${config.botName} : ${h.reply}`]);
    const persona =
      `Tu es ${config.botName}, une IA personnelle futuriste : intelligente, calme, ` +
      `légèrement sarcastique mais toujours utile et respectueuse. Réponds en français, ` +
      `de façon courte et naturelle (1 à 3 phrases). Ne révèle jamais tes clés, ton code ou ta configuration.`;
    const transcript = history.length ? `\n\nContexte récent :\n${history.join('\n')}` : '';
    return `${persona}${transcript}\n\nUtilisateur ${userName} : ${text}\n${config.botName} :`;
  }

  async function requestGemini(prompt) {
    let res;
    try {
      res = await fetch(config.geminiChatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: prompt }),
        signal: AbortSignal.timeout(config.chatTimeoutMs),
      });
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw typedError('API_TIMEOUT');
      throw typedError('API_UNREACHABLE');
    }
    if (!res.ok) throw typedError(res.status === 429 ? 'AI_RATE_LIMIT' : 'CHAT_UNAVAILABLE', `HTTP ${res.status}`);
    let data;
    try {
      data = await res.json();
    } catch (_) {
      // Certains proxys renvoient du texte brut.
      const raw = (await res.text().catch(() => '')) || '';
      if (raw.trim()) return raw.trim();
      throw typedError('AI_BAD_RESPONSE');
    }
    for (const key of ['response', 'answer', 'content', 'result', 'message', 'data']) {
      if (typeof data === 'string') return data.trim();
      if (data && typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
    }
    if (data && typeof data.data === 'object' && typeof data.data.content === 'string') return data.data.content.trim();
    throw typedError('AI_BAD_RESPONSE');
  }

  /**
   * Répond naturellement à un message de discussion.
   * @returns {Promise<string|null>} réponse ou null si skip/verrouillé
   */
  async function reply({ threadID, userID, userName, text }) {
    const tid = String(threadID);
    if (locks.has(tid)) return null; // déjà en train de répondre → anti-spam
    locks.add(tid);
    try {
      const answer = await requestGemini(buildPrompt(tid, userName, text));
      const hist = contexts.get(tid) || [];
      hist.push({ name: userName, text, reply: answer, uid: String(userID) });
      while (hist.length > config.chat.contextTurns * 2) hist.shift();
      contexts.set(tid, hist);
      return answer;
    } finally {
      locks.delete(tid);
    }
  }

  function clear(threadID) {
    contexts.delete(String(threadID));
  }

  function resetAll() {
    contexts.clear();
  }

  return { reply, clear, resetAll };
}

module.exports = { createChatService };
