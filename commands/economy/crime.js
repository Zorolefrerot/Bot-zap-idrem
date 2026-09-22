"use strict";

/**
 * /crime — tentative risquée : gros gain ou amende.
 */

const { box, lightBox, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "crime",
  aliases: ["braquage", "vol", "heist"],
  category: "economy",
  description: "Tente un coup risqué : gros gain ou amende (45 % de réussite).",
  usage: "/crime",
  examples: ["/crime"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const result = services.economy.crime(ctx.senderID);

    if (!result.ok) {
      return lightBox("CRIME", [
        `${ICONS.time} Trop risqué pour l'instant.`,
        `Nouvelle tentative dans : ${bag.helpers.formatDuration(result.remainingMs)}`
      ]);
    }

    if (result.success) {
      return box(
        "CRIME RÉUSSI",
        [
          `🕵️ ${result.message}`,
          `${ICONS.money} +${num(result.amount)} ${config.currency.symbol}`,
          `${ICONS.chart} Solde : ${services.economy.fmt(result.balance)}`
        ],
        { icon: ICONS.ok }
      );
    }

    return box(
      "CRIME RATÉ",
      [
        `🚨 ${result.message}`,
        result.fine > 0 ? `${ICONS.money} Amende : −${num(result.fine)} ${config.currency.symbol}` : `${ICONS.info} Aucune amende : tu n'avais rien sur toi.`,
        `${ICONS.chart} Solde : ${services.economy.fmt(result.balance)}`,
        "",
        `${ICONS.info} Taux de réussite : ${Math.round(config.economy.crime.successRate * 100)} %`
      ],
      { icon: ICONS.no }
    );
  }
};
