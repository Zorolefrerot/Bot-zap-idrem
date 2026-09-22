"use strict";

/**
 * /summarize — résume un texte collé (ou un message cité).
 *   /summarize <texte>
 *   /summarize puces <texte>
 */

const { box, lightBox, cmd, ICONS, num } = require("../../utils/text");

module.exports = {
  name: "summarize",
  aliases: ["resume", "résumé", "tl", "tl;dr", "synthese", "synthèse"],
  category: "ai",
  description: "Résume un texte long en quelques phrases ou en puces (nécessite une IA).",
  usage: "/summarize [puces] <texte>",
  examples: ["/summarize <ton texte>", "/summarize puces <ton texte>"],
  permissions: "public",
  cooldown: 10,
  external: true,

  async execute(ctx, bag) {
    const ai = bag.services.external.ai;
    const style = ["puces", "bullet", "liste"].includes(String(ctx.args[0] || "").toLowerCase()) ? "puces" : "phrases";
    const text = (style === "puces" ? ctx.args.slice(1).join(" ") : ctx.argString).trim();

    if (!ai.configured()) {
      return box(
        "IA NON CONFIGURÉE",
        [
          `${ICONS.plug} Le résumé automatique nécessite une clé IA (AI_API_KEY).`,
          "",
          `${ICONS.warn} Le bot ne résume pas « pour faire semblant » : sans IA, aucune sortie.`,
          `${ICONS.pin} Alternative sans clé : ${cmd("search", ctx.prefix)} pour un résumé Wikipédia.`
        ],
        { icon: ICONS.plug }
      );
    }

    if (!text) {
      return lightBox("RÉSUMÉ", [
        `${ICONS.warn} Aucun texte à résumer.`,
        "",
        `${cmd("summarize <ton texte ici>", ctx.prefix)}`,
        `${cmd("summarize puces <ton texte>", ctx.prefix)}`,
        "",
        `${ICONS.info} Minimum 40 caractères, maximum ${num(ai.MAX_PROMPT_CHARS)}.`
      ]);
    }

    const result = await ai.summarize(text, { style });
    if (!result.ok) return lightBox("RÉSUMÉ", [`${ICONS.no} ${result.message}`]);

    return box(
      "RÉSUMÉ",
      [result.data.text, "", `${ICONS.info} ${num(text.length)} caractères résumés • ${result.data.provider}`],
      { icon: ICONS.book }
    );
  }
};
