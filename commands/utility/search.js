"use strict";

/**
 * /search — recherche encyclopédique (Wikipédia, API publique sans clé).
 *   /search Valentina Tereshkova
 *   /search en artificial intelligence
 */

const { box, lightBox, cmd, ICONS, cut, num } = require("../../utils/text");

module.exports = {
  name: "search",
  aliases: ["wiki", "wikipedia", "recherche", "chercher"],
  category: "utility",
  description: "Recherche un sujet sur Wikipédia et en donne un résumé (API publique).",
  usage: "/search [fr|en] <terme>",
  examples: ["/search Valentina Tereshkova", "/search en black hole"],
  permissions: "public",
  cooldown: 6,

  async execute(ctx, bag) {
    const args = [...ctx.args];
    const language = ["fr", "en", "es", "de", "it", "pt", "ar"].includes(String(args[0] || "").toLowerCase()) ? args.shift().toLowerCase() : "fr";
    const term = args.join(" ").trim();

    if (!term) {
      return lightBox("RECHERCHE", [
        `${ICONS.warn} Aucun terme indiqué.`,
        "",
        `${cmd("search Valentina Tereshkova", ctx.prefix)}`,
        `${cmd("search en quantum computing", ctx.prefix)}`,
        "",
        `${ICONS.info} Source : Wikipédia (API publique, sans clé). Ce n'est pas un moteur de recherche web général.`
      ]);
    }

    const result = await bag.services.external.search.searchAndSummarize(term, { language, timeoutMs: 15000 });
    if (!result.ok) {
      return lightBox("RECHERCHE", [
        `${ICONS.no} ${result.message}`,
        "",
        result.kind === "not-found"
          ? `${ICONS.pin} Essaie un terme plus précis ou en anglais : ${cmd("search en " + cut(term, 20), ctx.prefix)}`
          : `${ICONS.info} Source : Wikipédia.`
      ]);
    }

    const data = result.data;
    const lines = [
      data.description ? `${ICONS.info} ${data.description}` : "",
      "",
      cut(data.extract, 700),
      ""
    ];

    if (Array.isArray(data.results) && data.results.length) {
      lines.push(`${ICONS.chart} Autres résultats :`);
      for (const entry of data.results.slice(0, 4)) {
        lines.push(`  • ${entry.title} — ${cut(entry.snippet, 90)}`);
      }
      lines.push("");
    }

    lines.push(`${ICONS.pin} Article : ${data.url}`);

    return box(`RECHERCHE — ${cut(String(data.title || term).toUpperCase(), 26)}`, lines.filter(Boolean), {
      icon: "🔎",
      footer: [`Source : Wikipédia (${language}) • ${num(String(data.extract || "").length)} caractères`]
    });
  }
};
