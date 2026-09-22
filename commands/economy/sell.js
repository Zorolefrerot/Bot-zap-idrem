"use strict";

/**
 * /sell — revend un article (50 % du prix d'achat).
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "sell",
  aliases: ["vendre", "vente"],
  category: "economy",
  description: "Revend un objet de ton inventaire (50 % du prix d'achat).",
  usage: "/sell <article> [quantité]",
  examples: ["/sell coffee", "/sell pizza 2"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const itemId = ctx.args[0];
    const qty = Number(ctx.args[1]) || 1;

    if (!itemId) {
      return lightBox("VENTE", [
        `${ICONS.warn} Indique l'article à revendre.`,
        "",
        `${cmd("sell coffee", ctx.prefix)} — ${cmd("inventory", ctx.prefix)} pour voir ce que tu possèdes`
      ]);
    }

    const result = services.economy.sell(ctx.senderID, itemId, qty);
    if (!result.ok) {
      return lightBox("VENTE", [
        `${ICONS.no} ${result.error}`,
        "",
        `${ICONS.pin} ${cmd("inventory", ctx.prefix)} pour la liste de tes objets`
      ]);
    }

    return box(
      "VENTE EFFECTUÉE",
      [
        `${result.item.icon} ${result.item.name} ×${num(result.quantity)} vendu(s)`,
        `${ICONS.money} +${num(result.value)} ${config.currency.symbol}`,
        `${ICONS.chart} Solde : ${services.economy.fmt(result.balance)}`
      ],
      { icon: ICONS.ok }
    );
  }
};
