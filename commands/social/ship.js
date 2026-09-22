"use strict";

/**
 * /ship — marie (pour rire) deux personnes du groupe.
 *   /ship @a @b
 *   /ship @a          → toi et @a
 */

const { box, lightBox, cmd, num, progress, ICONS } = require("../../utils/text");
const { dailyValue, verdict, pick } = require("../../utils/random");

const TITLES = ["duo de l'année", "couple improbable", "binôme officiel", "team de choc", "association risquée"];

module.exports = {
  name: "ship",
  aliases: ["shipper", "couple", "match"],
  category: "social",
  description: "Associe deux personnes et affiche leur compatibilité (divertissement).",
  usage: "/ship [@personne1] [@personne2]",
  examples: ["/ship @a @b", "/ship @quelquun"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const mentions = ctx.mentions;
    const first = mentions[0] ? mentions[0].id : ctx.resolveTarget(ctx.args[0]).id;
    const second = mentions[1] ? mentions[1].id : ctx.args[1] && /^\d{5,25}$/.test(ctx.args[1]) ? ctx.args[1] : ctx.senderID;

    if (!first || !second) {
      return lightBox("SHIP", [
        `${ICONS.warn} Mentionne une ou deux personnes.`,
        "",
        `${cmd("ship @a @b", ctx.prefix)} — ou ${cmd("ship @quelquun", ctx.prefix)} pour toi + cette personne`
      ]);
    }
    if (first === second) {
      return lightBox("SHIP", [`${ICONS.info} On ne peut pas shipper quelqu'un avec lui-même.`, "", `${cmd("ship @a @b", ctx.prefix)}`]);
    }

    const nameA = ctx.displayName(first);
    const nameB = ctx.displayName(second);
    const percent = dailyValue(`ship:${[first, second].sort().join(":")}`, 1, 100);
    const judgement = verdict(percent);
    const title = pick(TITLES);

    bag.services.users.get(first);
    bag.services.users.get(second);

    return box(
      "SHIP",
      [
        `${ICONS.heart} ${nameA} 💞 ${nameB}`,
        `${ICONS.pin} ${title}`,
        "",
        `${judgement.icon} ${num(percent)} % — ${judgement.label}`,
        progress(percent, 100),
        "",
        `💬 ${judgement.comment}`,
        `${ICONS.info} Divertissement uniquement — rien de sérieux ici.`
      ],
      { icon: ICONS.heart }
    );
  }
};
