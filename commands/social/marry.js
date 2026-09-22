"use strict";

/**
 * /marry — mariage virtuel (humour).
 *   /marry @quelquun
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "marry",
  aliases: ["marier", "mariage", "wedding"],
  category: "social",
  description: "Épouse virtuellement quelqu'un (divertissement, sans valeur réelle).",
  usage: "/marry <@personne|uid>",
  examples: ["/marry @quelquun"],
  permissions: "public",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);

    if (!target.explicit || target.id === ctx.senderID) {
      return lightBox("MARIAGE", [
        `${ICONS.warn} Mentionne la personne que tu veux épouser.`,
        "",
        `${cmd("marry @quelquun", ctx.prefix)}`
      ]);
    }

    const result = services.users.marry(ctx.senderID, target.id);
    if (!result.ok) {
      return lightBox("MARIAGE", [`${ICONS.no} ${result.error}`]);
    }

    const nameA = ctx.senderName || ctx.displayName(ctx.senderID);
    const nameB = target.name || ctx.displayName(target.id);
    const date = new Date(result.at).toLocaleDateString("fr-FR", { dateStyle: "long" });

    return box(
      "MARIAGE CÉLÉBRÉ",
      [
        `${ICONS.heart} ${nameA} 💍 ${nameB}`,
        "",
        `📜 Union célébrée le ${date}`,
        `${ICONS.info} Mariage 100 % virtuel : aucune valeur légale, beaucoup d'humour.`,
        "",
        `${cmd("divorce", ctx.prefix)} pour annuler (sans frais… pour l'instant)`
      ],
      { icon: ICONS.heart }
    );
  }
};
