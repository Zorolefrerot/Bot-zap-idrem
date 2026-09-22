"use strict";

/**
 * /love — compatibilité amoureuse (divertissement, résultat stable par jour).
 *   /love @quelquun
 *   /love            → avec une personne tirée au sort dans le groupe
 */

const { box, lightBox, cmd, num, progress, ICONS } = require("../../utils/text");
const { dailyValue, verdict } = require("../../utils/random");

module.exports = {
  name: "love",
  aliases: ["amour", "compatibilite", "compatibilité", "lovecheck"],
  category: "social",
  description: "Mesure la compatibilité amoureuse entre deux personnes (100 % divertissement).",
  usage: "/love [@personne]",
  examples: ["/love @quelquun", "/love"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const { services, random } = bag;
    let target = ctx.resolveTarget(ctx.args[0]);

    if (!target.explicit) {
      const others = (ctx.participantIDs || []).filter((id) => id !== ctx.senderID);
      if (!others.length) {
        return lightBox("LOVE", [
          `${ICONS.warn} Mentionne quelqu'un pour mesurer votre compatibilité.`,
          "",
          `${cmd("love @quelquun", ctx.prefix)}`
        ]);
      }
      target = { id: random.pick(others), name: "", source: "random", explicit: true };
    }

    if (target.id === ctx.senderID) {
      return lightBox("LOVE", [`${ICONS.heart} L'amour de soi, c'est déjà 100 %.`, "", `${cmd("love @quelquun", ctx.prefix)} pour tester avec une autre personne.`]);
    }

    const nameA = ctx.senderName || ctx.displayName(ctx.senderID);
    const nameB = target.name || ctx.displayName(target.id);
    const pairKey = [ctx.senderID, target.id].sort().join(":");
    const percent = dailyValue(`love:${pairKey}`, 5, 99);
    const judgement = verdict(percent);

    services.users.get(target.id);

    return box(
      "COMPATIBILITÉ",
      [
        `${ICONS.heart} ${nameA} × ${nameB}`,
        "",
        `${judgement.icon} ${num(percent)} % — ${judgement.label}`,
        progress(percent, 100),
        "",
        `💬 ${judgement.comment}`,
        "",
        `${ICONS.info} Résultat purement ludique, stable pour la journée.`
      ],
      { icon: ICONS.heart, footer: [`${cmd("ship", ctx.prefix)} pour marier deux personnes, ${cmd("marry", ctx.prefix)} pour officialiser`] }
    );
  }
};
