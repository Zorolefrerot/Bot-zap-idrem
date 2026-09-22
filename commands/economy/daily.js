"use strict";

/**
 * /daily — bonus quotidien.
 */

const { box, lightBox, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "daily",
  aliases: ["bonus", "quotidien", "recompense"],
  category: "economy",
  description: "Récupère ton bonus quotidien d'IDREM Coins.",
  usage: "/daily",
  examples: ["/daily"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const claimed = services.economy.claimDaily(ctx.senderID);

    if (!claimed.ok) {
      return lightBox("BONUS QUOTIDIEN", [
        `${ICONS.time} Déjà récupéré.`,
        `Prochain bonus dans : ${bag.helpers.formatDuration(claimed.remainingMs)}`,
        "",
        `${ICONS.money} Solde actuel : ${services.economy.fmt(services.economy.balance(ctx.senderID))}`
      ]);
    }

    const min = config.economy.daily.min;
    const max = config.economy.daily.max;
    return box(
      "BONUS QUOTIDIEN",
      [
        `${ICONS.money} +${num(claimed.amount)} ${config.currency.symbol} !`,
        `${ICONS.chart} Solde : ${services.economy.fmt(claimed.balance)}`,
        "",
        `${ICONS.info} Fourchette du jour : ${num(min)} à ${num(max)} ${config.currency.symbol}`,
        `${ICONS.time} Prochain bonus dans ${config.economy.daily.cooldownHours} h`
      ],
      { icon: ICONS.ok }
    );
  }
};
