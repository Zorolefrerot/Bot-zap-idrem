"use strict";

/**
 * /ask — question courte avec réponse concise (même moteur que /ai).
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "ask",
  aliases: ["question", "demande", "demandeai"],
  category: "ai",
  description: "Pose une question à l'IA et reçois une réponse courte et directe.",
  usage: "/ask <question>",
  examples: ["/ask pourquoi le ciel est bleu ?"],
  permissions: "public",
  cooldown: 8,
  external: true,

  async execute(ctx, bag) {
    const ai = bag.services.external.ai;
    const question = ctx.argString.trim();

    if (!ai.configured()) {
      return box(
        "IA NON CONFIGURÉE",
        [
          `${ICONS.plug} Aucune clé IA n'est définie sur ce déploiement.`,
          "",
          "Configure AI_PROVIDER + AI_API_KEY pour activer /ask.",
          `${ICONS.warn} Aucune réponse n'est simulée.`
        ],
        { icon: ICONS.plug }
      );
    }

    if (!question) {
      return lightBox("QUESTION", [`${ICONS.warn} Écris ta question.`, "", cmd("ask pourquoi la mer est salée ?", ctx.prefix)]);
    }

    const result = await ai.ask(question, {
      maxTokens: 350,
      temperature: 0.4,
      system:
        "Tu es IDREM TERESHKOVA, assistant d'un bot Messenger francophone. " +
        "Réponds en 3 phrases maximum, de façon directe et factuelle, en français. " +
        "Pas de Markdown, pas de listes à puces sauf si indispensable."
    });

    if (!result.ok) return lightBox("QUESTION", [`${ICONS.no} ${result.message}`]);

    return box("RÉPONSE", [result.data.text, "", `${ICONS.info} ${result.data.provider} • ${result.data.model}`], { icon: ICONS.robot });
  }
};
