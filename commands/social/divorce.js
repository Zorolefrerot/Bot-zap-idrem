"use strict";

/**
 * /divorce — met fin au mariage virtuel.
 */

const { box, lightBox, ICONS } = require("../../utils/text");

module.exports = {
  name: "divorce",
  aliases: ["divorcer", "separation", "séparation"],
  category: "social",
  description: "Met fin à ton mariage virtuel.",
  usage: "/divorce",
  examples: ["/divorce"],
  permissions: "public",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services } = bag;
    const before = services.users.get(ctx.senderID);
    if (!before.marriedTo) {
      return lightBox("DIVORCE", [`${ICONS.info} Tu n'es marié(e) à personne.`, "", `${cmdHint(ctx)} `]);
    }

    const result = services.users.divorce(ctx.senderID);
    if (!result.ok) return lightBox("DIVORCE", [`${ICONS.no} ${result.error}`]);

    const partner = ctx.displayName(result.partner);
    return box(
      "DIVORCE PRONONCÉ",
      [
        `${ICONS.warn} Union dissoute avec ${partner}.`,
        "",
        `${ICONS.info} C'était virtuel : personne n'est blessé (normalement).`,
        `${ICONS.heart} ${ctx.prefix}marry @quelquun pour repartir de zéro`
      ]
    );
  }
};

function cmdHint(ctx) {
  return `${ctx.prefix}marry @quelquun pour te marier`;
}
