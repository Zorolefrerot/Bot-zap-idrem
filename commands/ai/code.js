"use strict";

/**
 * /code — aide au développement.
 *   /code fonction js qui inverse une chaîne
 *   /code python tri fusion
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

const LANGUAGES = ["javascript", "js", "python", "java", "c", "cpp", "c#", "php", "sql", "bash", "html", "css", "go", "rust", "kotlin", "swift", "ruby"];

module.exports = {
  name: "code",
  aliases: ["coder", "dev", "programme", "programmer", "snippet"],
  category: "ai",
  description: "Génère ou explique du code dans le langage demandé (nécessite une IA).",
  usage: "/code [langage] <demande>",
  examples: ["/code js fonction qui trie un tableau", "/code python lire un fichier CSV"],
  permissions: "public",
  cooldown: 12,
  external: true,

  async execute(ctx, bag) {
    const ai = bag.services.external.ai;
    const first = String(ctx.args[0] || "").toLowerCase();
    const language = LANGUAGES.includes(first) ? first : "";
    const request = (language ? ctx.args.slice(1) : ctx.args).join(" ").trim();

    if (!ai.configured()) {
      return box(
        "IA NON CONFIGURÉE",
        [
          `${ICONS.plug} La génération de code nécessite une clé IA (AI_API_KEY).`,
          "",
          `${ICONS.warn} Aucun code n'est inventé sans modèle : le bot refuse de produire du faux.`,
          `${ICONS.pin} ${cmd("calc", ctx.prefix)} reste disponible pour l'algorithmique numérique.`
        ],
        { icon: ICONS.plug }
      );
    }

    if (!request) {
      return lightBox("CODE", [
        `${ICONS.warn} Décris ce que tu veux coder.`,
        "",
        `${cmd("code js fonction qui inverse une chaîne", ctx.prefix)}`,
        `${cmd("code python lire un fichier CSV", ctx.prefix)}`,
        `${cmd("code sql jointure entre deux tables", ctx.prefix)}`,
        "",
        `${ICONS.info} Langages reconnus : ${LANGUAGES.slice(0, 10).join(", ")}…`
      ]);
    }

    const result = await ai.code(request, { language });
    if (!result.ok) return lightBox("CODE", [`${ICONS.no} ${result.message}`]);

    return box(
      `CODE${language ? ` — ${language.toUpperCase()}` : ""}`,
      [result.data.text, "", `${ICONS.info} ${result.data.provider} • ${result.data.model}`, `${ICONS.warn} Vérifie et teste toujours le code généré avant de l'utiliser.`],
      { icon: ICONS.tool }
    );
  }
};
