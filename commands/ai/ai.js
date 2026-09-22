"use strict";

/**
 * /ai — conversation avec l'IA (si un fournisseur est configuré).
 *   /ai explique-moi les trous noirs en 2 phrases
 *
 * Sans clé : message « service non configuré », jamais de fausse réponse.
 */

const { box, lightBox, cmd, ICONS, cut } = require("../../utils/text");

module.exports = {
  name: "ai",
  aliases: ["gpt", "chat", "ia"],
  category: "ai",
  description: "Discute avec l'IA configurée (OpenAI, Groq, OpenRouter…).",
  usage: "/ai <question ou consigne>",
  examples: ["/ai explique la gravité en 2 phrases", "/ai donne-moi 3 idées de dîner"],
  permissions: "public",
  cooldown: 8,
  external: true,

  async execute(ctx, bag) {
    const ai = bag.services.external.ai;
    const prompt = ctx.argString.trim();

    if (!ai.configured()) {
      const info = ai.info();
      return box(
        "IA NON CONFIGURÉE",
        [
          `${ICONS.plug} Le module IA est présent mais aucune clé n'est fournie.`,
          "",
          `${ICONS.gear} Variables attendues :`,
          "  AI_PROVIDER = openai | groq | openrouter | custom",
          "  AI_API_KEY  = ta clé secrète (jamais dans Git)",
          "  AI_MODEL    = optionnel (défaut selon le fournisseur)",
          "",
          `${ICONS.info} Fournisseur détecté : ${info.provider || "aucun"}`,
          `${ICONS.warn} Le bot n'invente jamais de réponse d'IA : rien n'est simulé ici.`
        ],
        { icon: ICONS.plug, footer: [`${ICONS.pin} En attendant : ${cmd("search", ctx.prefix)}, ${cmd("define", ctx.prefix)}, ${cmd("calc", ctx.prefix)} fonctionnent sans clé.`] }
      );
    }

    if (!prompt) {
      return lightBox("IA", [
        `${ICONS.warn} Pose une question après la commande.`,
        "",
        `${cmd("ai explique-moi la photosynthèse", ctx.prefix)}`,
        `${cmd("ai 3 idées de message d'anniversaire", ctx.prefix)}`,
        "",
        `${ICONS.info} Fournisseur : ${ai.info().provider} • modèle ${ai.info().model}`
      ]);
    }

    const result = await ai.ask(prompt, { maxTokens: 700 });
    if (!result.ok) {
      return lightBox("IA", [
        `${ICONS.no} ${result.message}`,
        "",
        result.kind === "not-configured" ? "Vérifie AI_API_KEY / AI_PROVIDER." : `${ICONS.info} Fournisseur : ${ai.info().provider}`
      ]);
    }

    return box(
      "RÉPONSE IA",
      [result.data.text, "", `${ICONS.info} ${result.data.provider} • ${result.data.model}${result.data.truncated ? " (réponse tronquée)" : ""}`],
      { icon: ICONS.robot }
    );
  }
};
