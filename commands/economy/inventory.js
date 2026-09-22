"use strict";

/**
 * /inventory — contenu de l'inventaire (le tien ou celui d'un autre).
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "inventory",
  aliases: ["inv", "inventaire", "sac", "bag"],
  category: "economy",
  description: "Affiche ton inventaire d'objets virtuels et sa valeur.",
  usage: "/inventory [@personne|uid]",
  examples: ["/inventory"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);
    const isSelf = target.id === ctx.senderID;
    const items = services.economy.inventory(target.id);
    const value = services.economy.inventoryValue(target.id);
    const slots = config.limits.maxInventorySlots;
    const badges = services.economy.badges(target.id);

    if (!items.length) {
      return lightBox("INVENTAIRE", [
        `${isSelf ? "Ton inventaire est vide." : "Cet utilisateur n'a aucun objet."}`,
        "",
        `${ICONS.pin} ${cmd("shop", ctx.prefix)} pour voir la boutique`,
        `${ICONS.money} ${cmd("daily", ctx.prefix)} pour gagner tes premières pièces`
      ]);
    }

    const catalog = new Map(services.economy.SHOP_ITEMS.map((item) => [item.id, item]));
    const lines = items.map((entry) => {
      const item = catalog.get(entry.id);
      const unit = item ? Math.floor(item.price * 0.5) : 0;
      return `${item ? item.icon : "📦"} ${entry.name || entry.id} ×${num(entry.qty)}${unit ? ` — ${num(unit * entry.qty)} ${config.currency.symbol}` : ""}`;
    });

    return box(
      isSelf ? "MON INVENTAIRE" : "INVENTAIRE",
      [
        `${ICONS.user} ${isSelf ? "Toi" : ctx.displayName(target.id)}`,
        `${ICONS.media} ${items.length}/${slots} emplacements utilisés`,
        badges.length ? `${ICONS.pin} Badges : ${badges.map((b) => b.icon).join(" ")}` : "",
        "",
        ...lines,
        "",
        `${ICONS.money} Valeur totale (revente) : ${services.economy.fmt(value)}`
      ].filter(Boolean),
      { footer: [`${ICONS.pin} ${cmd("sell <objet>", ctx.prefix)} pour revendre`] }
    );
  }
};
