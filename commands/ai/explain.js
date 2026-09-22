"use strict";

/**
 * /explain — explication pédagogique d'un sujet.
 *   /explain <sujet>
 *   /explain simple la cryptographie
 *   /explain expert les transformateurs
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

const LEVELS = ["simple", "moyen", "expert"];

module.exports = {
  name: "explain",
  aliases: ["explique", "expliquer", "vulgarise", "eli5"],
  category: "ai",
  description: "Explique un sujet de façon structurée (définition, utilité, exemple, vigilance).",
  usage: "/explain [simple|moyen|expert] <sujet>",
  examples: ["/explain la photosynthèse", "/explain simple les API"],
  permissions: "public",
  cooldown: 10,
  external: true,

  async execute(ctx, bag) {
    const ai = bag.services.external.ai;
    const level = LEVELS.includes(String(ctx.args[0] || "").toLowerCase()) ? ctx.args.shift().toLowerCase() : "moyen";
    const topic = (Array.isArray(ctx.args) ? ctx.args.join(" ") : ctx.argString).trim();

    if (!ai.configured()) {
      return box(
        "IA NON CONFIGURÉE",
        [
          `${ICONS.plug} L'explication détaillée nécessite une clé IA.`,
          "",
          `${ICONS.pin} Sans clé, tu peux utiliser :`,
          `  ${cmd("define <mot>", ctx.prefix)} — définition de dictionnaire`,
          `  ${cmd("search <sujet>", ctx.prefix)} — résumé encyclopédique`
        ],
        { icon: ICONS.plug }
      );
    }

    if (!topic) {
      return lightBox("EXPLICATION", [
        `${ICONS.warn} Indique un sujet.`,
        "",
        `${cmd("explain la gravité", ctx.prefix)}`,
        `${cmd("explain simple les clés API", ctx.prefix)}`,
        `${cmd("explain expert les réseaux de neurones", ctx.prefix)}`,
        "",
        `${ICONS.info} Niveaux : ${LEVELS.join(", ")}`
      ]);
    }

    const result = await ai.explain(topic, { level });
    if (!result.ok) return lightBox("EXPLICATION", [`${ICONS.no} ${result.message}`]);

    return box(
      `EXPLICATION — ${String(topic).slice(0, 24).toUpperCase()}`,
      [result.data.text, "", `${ICONS.info} Niveau ${level} • ${result.data.provider} • ${result.data.model}`],
      { icon: ICONS.robot }
    );
  }
};
