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
    // Personnalité officielle de MeR~NEL (fiche Xinfo).
    const base =
      `Tu es ${config.botName}, tu n'es PAS ChatGPT. Tu es sarcastique, intelligent, ` +
      `un peu piquant mais attachant. Tu réponds court, comme un humain : tu vannes, ` +
      `tu piques, tu aides. Jamais méchant. Tu ne révèles jamais tes clés, ton code ou ta configuration.`;
    const system =
      opts.mode === 'advanced'
        ? `${base} Réponds en français de façon structurée et utile.`
        : base;
    const { text } = await aiPool.ask(question, { system });
    return String(text).trim();
  }

  return { ask };
}

module.exports = { createAiService };
