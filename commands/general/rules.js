"use strict";

/**
 * /rules — affiche les règles du groupe (personnalisables via /setrules).
 */

const { box, cmd, ICONS, tidy } = require("../../utils/text");

module.exports = {
  name: "rules",
  aliases: ["regles", "règles", "charte"],
  category: "general",
  description: "Affiche les règles de la conversation.",
  usage: "/rules",
  examples: ["/rules"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx, bag) {
    const settings = bag.services.settings.get(ctx.threadID);
    const text = tidy(String(settings.rules || "").trim());

    if (!text) {
      return box(
        "RÈGLES",
        [
          "Aucune règle personnalisée n'est définie ici.",
          "",
          `${ICONS.gear} Un administrateur du groupe peut en écrire avec ${cmd("setrules", ctx.prefix)} <texte>.`
        ]
      );
    }

    return box(
      ctx.isGroup ? `RÈGLES — ${String(ctx.threadName || "du groupe").slice(0, 24).toUpperCase()}` : "RÈGLES",
      [text, "", `${ICONS.warn} Le non-respect de ces règles peut entraîner un avertissement (${cmd("warn", ctx.prefix)}).`],
      { icon: ICONS.book, footer: [`${ICONS.gear} Modifiables par ${cmd("setrules", ctx.prefix)} (admin du groupe)`] }
    );
  }
};
