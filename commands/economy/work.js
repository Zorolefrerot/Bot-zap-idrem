"use strict";

/**
 * /work — travaille pour gagner des pièces.
 */

const { box, lightBox, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "work",
  aliases: ["travail", "job", "travailler"],
  category: "economy",
  description: "Travaille pour gagner des IDREM Coins (cooldown 45 min).",
  usage: "/work",
  examples: ["/work"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const result = services.economy.work(ctx.senderID);

    if (!result.ok) {
      return lightBox("TRAVAIL", [
        `${ICONS.time} Tu as déjà travaillé récemment.`,
        `Prochain shift dans : ${bag.helpers.formatDuration(result.remainingMs)}`
      ]);
    }

    return box(
      "TRAVAIL TERMINÉ",
      [
        `🧰 Tu as travaillé comme ${result.job}.`,
        `${ICONS.money} +${num(result.amount)} ${config.currency.symbol}`,
        `${ICONS.chart} Solde : ${services.economy.fmt(result.balance)}`,
        "",
        `${ICONS.time} Prochain travail dans ${config.economy.work.cooldownMinutes} min`
      ],
      { icon: ICONS.ok }
    );
  }
};
