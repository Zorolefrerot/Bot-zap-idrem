'use strict';
/*
 * 🧬 MeR~NeL — services/ai.js
 * Xask / Xai — passe par le pool d'IA à rotation automatique
 * (gemini-proxy → pollinations → shizo → paxsenix → ryzendesu).
 * Aucune clé personnelle requise ; les erreurs remontent typées.
 */

const config = require('../core/config');

function createAiService(logger, aiPool) {
  function typedError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  /**
   * Pose une question à l'IA (rotation automatique des fournisseurs).
   * @param {string} question question validée (sanitizée en amont)
   * @param {{mode?: 'short'|'advanced'}} opts
   * @returns {Promise<string>} texte de réponse
   */
  async function ask(question, opts = {}) {
    if (!question || !String(question).trim()) throw typedError('AI_EMPTY_QUESTION');
    const system =
      opts.mode === 'advanced'
        ? `Tu es ${config.botName}, une IA futuriste calme et brillante. Réponds en français de façon structurée et utile.`
        : `Tu es ${config.botName}. Réponds en français, de façon claire et concise.`;
    const { text } = await aiPool.ask(question, { system });
    return String(text).trim();
  }

  return { ask };
}

module.exports = { createAiService };
