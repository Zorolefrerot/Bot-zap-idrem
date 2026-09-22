"use strict";

/**
 * /short — raccourcit une URL (is.gd, puis TinyURL en repli).
 */

const { box, lightBox, cmd, ICONS, cut } = require("../../utils/text");

module.exports = {
  name: "short",
  aliases: ["shorten", "url", "lien", "shorturl"],
  category: "utility",
  description: "Raccourcit une URL longue via un service public (is.gd / TinyURL).",
  usage: "/short <url>",
  examples: ["/short https://exemple.com/tres/long/chemin"],
  permissions: "public",
  cooldown: 6,

  async execute(ctx, bag) {
    const url = ctx.args[0];
    if (!url) {
      return lightBox("LIEN COURT", [
        `${ICONS.warn} Aucune URL fournie.`,
        "",
        `${cmd("short https://exemple.com/page/tres/longue", ctx.prefix)}`,
        "",
        `${ICONS.lock} Seuls http et https sont acceptés (jamais javascript:, data:, adresses locales).`
      ]);
    }

    const result = await bag.services.external.shortener.shorten(url, { timeoutMs: 12000 });
    if (!result.ok) {
      return lightBox("LIEN COURT", [
        `${ICONS.no} ${result.message}`,
        "",
        result.kind === "error" ? `${ICONS.pin} Exemple : ${cmd("short https://exemple.com/a/b", ctx.prefix)}` : `${ICONS.info} Réessaie dans quelques instants.`
      ]);
    }

    return box(
      "LIEN RACCOURCI",
      [
        `${ICONS.ok} ${result.data.short}`,
        "",
        `${ICONS.info} Destination : ${cut(result.data.hostname, 40)}`,
        `${ICONS.info} Service : ${result.data.provider}`,
        "",
        `${ICONS.warn} Un lien court masque l'adresse réelle : vérifie toujours avant de cliquer.`
      ]
    );
  }
};
