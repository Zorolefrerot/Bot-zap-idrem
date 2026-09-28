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
    // Xask/Xai = réponses VRAIES, sans personnalité ni rôle.
    const base =
      `Tu es un assistant IA factuel et précis. Donne des réponses VRAIES, exactes ` +
      `et vérifiables. Aucune blague, aucun sarcasme, aucun personnage : uniquement ` +
      `l'information utile. Si tu n'es pas certain, dis-le clairement. Réponds en ` +
      `français, clair et direct.`;
    const system =
      opts.mode === 'advanced'
        ? `${base} Structure les réponses longues (titres courts, listes).`
        : base;
    const { text } = await aiPool.ask(question, { system });
    return String(text).trim();
  }

  return { ask };
}

module.exports = { createAiService };
