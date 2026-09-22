"use strict";

/**
 * /define — définition d'un mot (Wiktionnaire, repli Wikipédia).
 */

const { box, lightBox, cmd, ICONS, cut } = require("../../utils/text");

module.exports = {
  name: "define",
  aliases: ["definition", "définition", "dico", "wiktionary"],
  category: "utility",
  description: "Donne la définition d'un mot (Wiktionnaire, ou Wikipédia pour les noms propres).",
  usage: "/define <mot>",
  examples: ["/define algorithme", "/define Tereshkova"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const term = ctx.argString.trim();

    if (!term) {
      return lightBox("DÉFINITION", [
        `${ICONS.warn} Aucun mot indiqué.`,
        "",
        `${cmd("define algorithme", ctx.prefix)}`,
        `${cmd("define orbite", ctx.prefix)}`,
        "",
        `${ICONS.info} Source : Wiktionnaire francophone (API publique).`
      ]);
    }

    const result = await bag.services.external.define.define(term, { language: "fr", limit: 4, timeoutMs: 15000 });
    if (!result.ok) {
      return lightBox("DÉFINITION", [
        `${ICONS.no} ${result.message}`,
        "",
        result.kind === "not-found"
          ? `${ICONS.pin} Vérifie l'orthographe, ou essaie ${cmd("search " + cut(term, 24), ctx.prefix)}.`
          : `${ICONS.info} Source : Wiktionnaire / Wikipédia.`
      ]);
    }

    const data = result.data;
    const lines = data.senses.map((sense, index) => {
      const label = sense.part ? ` (${sense.part})` : "";
      return `${index + 1}. ${sense.text}${label}`;
    });

    if (data.note) lines.push("", `${ICONS.info} ${data.note}`);

    return box(`DÉFINITION — ${cut(term.toUpperCase(), 24)}`, [...lines, "", `${ICONS.pin} Source : ${data.url}`], {
      icon: ICONS.book,
      footer: [`Via ${data.source}`]
    });
  }
};
