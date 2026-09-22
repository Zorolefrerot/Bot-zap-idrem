"use strict";

/**
 * /buy — achète un article de la boutique.
 *   /buy coffee
 *   /buy badge_vip 2
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "buy",
  aliases: ["acheter", "achat"],
  category: "economy",
  description: "Achète un article de la boutique avec tes IDREM Coins.",
  usage: "/buy <article> [quantité]",
  examples: ["/buy coffee", "/buy badge_vip", "/buy pizza 2"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const itemId = ctx.args[0];
    const qty = Number(ctx.args[1]) || 1;

    if (!itemId) {
      return lightBox("ACHAT", [
        `${ICONS.warn} Indique l'article à acheter.`,
        "",
        `${cmd("buy coffee", ctx.prefix)} — ${cmd("shop", ctx.prefix)} pour le catalogue`
      ]);
    }

    const result = services.economy.buy(ctx.senderID, itemId, qty);
    if (!result.ok) {
      const suggestion = services.economy.SHOP_ITEMS.find((item) => item.name.toLowerCase().includes(String(itemId).toLowerCase()));
      return lightBox("ACHAT", [
        `${ICONS.no} ${result.error}`,
        "",
        suggestion ? `🔎 Voulais-tu dire ${cmd(`buy ${suggestion.id}`, ctx.prefix)} (${suggestion.name}) ?` : `${ICONS.pin} Catalogue : ${cmd("shop", ctx.prefix)}`
      ]);
    }

    return box(
      "ACHAT CONFIRMÉ",
      [
        `${result.item.icon} ${result.item.name} ×${num(result.quantity)}`,
        `${ICONS.money} −${num(result.total)} ${config.currency.symbol}`,
        `${ICONS.chart} Solde restant : ${services.economy.fmt(result.balance)}`,
        "",
        `${ICONS.media} ${cmd("inventory", ctx.prefix)} pour voir tes objets`
      ],
      { icon: ICONS.ok }
    );
  }
};
