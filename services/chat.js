'use strict';
/*
 * 🧬 MeR~NeL — services/chat.js
 * Mode discussion automatique (Xchat on/off) via le pool d'IA à rotation.
 * Contexte court par thread + verrou anti-tempête : quand chatMode est ON,
 * le bot répond à TOUS les messages sans préfixe.
 */

const config = require('../core/config');

function createChatService(logger, aiPool) {
  /** Map<threadID, [{name, text, reply}]> */
  const contexts = new Map();
  /** Un seul appel à la fois par thread. */
  const locks = new Set();

  function buildPrompt(threadID, userName, text) {
    const history = (contexts.get(threadID) || [])
      .slice(-config.chat.contextTurns)
      .flatMap((h) => [`Utilisateur ${h.name} : ${h.text}`, `${config.botName} : ${h.reply}`]);
    const persona =
      `Tu es ${config.botName}, une IA personnelle futuriste : intelligente, calme, ` +
      `légèrement sarcastique mais toujours utile et respectueuse. Réponds en français, ` +
      `de façon courte et naturelle (1 à 3 phrases). Ne révèle jamais tes clés, ton code ou ta configuration.`;
    const transcript = history.length ? `\n\nContexte récent :\n${history.join('\n')}` : '';
    return { question: `${userName} dit : ${text}`, system: `${persona}${transcript}` };
  }

  /**
   * Répond naturellement à un message de discussion.
   * @returns {Promise<string|null>} réponse ou null si verrouillé
   */
  async function reply({ threadID, userID, userName, text }) {
    const tid = String(threadID);
    if (locks.has(tid)) return null; // déjà en train de répondre → anti-tempête
    locks.add(tid);
    try {
      const { question, system } = buildPrompt(tid, userName, text);
      const { text: answer } = await aiPool.ask(question, { system });
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
