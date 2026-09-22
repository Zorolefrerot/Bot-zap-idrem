"use strict";

/**
 * /shop — catalogue de la boutique.
 *   /shop         → tous les articles
 *   /shop badge   → filtre par type
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

const TYPES = { badge: "🎖️ Badges", conso: "☕ Consommables", objet: "📦 Objets" };

module.exports = {
  name: "shop",
  aliases: ["boutique", "magasin", "store"],
  category: "economy",
  description: "Affiche la boutique : badges, objets et consommables virtuels.",
  usage: "/shop [badge|objet|conso]",
  examples: ["/shop", "/shop badge"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const filter = String(ctx.args[0] || "").trim().toLowerCase();
    const items = services.economy.shop();
    const owned = new Map(services.economy.inventory(ctx.senderID).map((entry) => [entry.id, entry.qty]));

    const selected = filter && TYPES[filter] ? items.filter((item) => item.type === filter) : items;
    if (!selected.length) {
      return lightBox("BOUTIQUE", [`Aucun article de type « ${filter} ».`, "", `Types : ${Object.keys(TYPES).join(", ")}`]);
    }

    const lines = [];
    let currentType = "";
    for (const item of selected) {
      if (item.type !== currentType) {
        currentType = item.type;
        lines.push("", `${TYPES[item.type] || item.type}`);
      }
      const qty = owned.get(item.id) || 0;
      lines.push(
        `${item.icon} ${item.name} — ${num(item.price)} ${config.currency.symbol}${qty ? ` (tu en as ${qty})` : ""}`,
        `   ${item.description}`
      );
    }

    return box(
      "BOUTIQUE",
      [
        `${ICONS.money} Ton solde : ${services.economy.fmt(services.economy.balance(ctx.senderID))}`,
        ...lines.filter((line, index) => !(index === 0 && line === "")),
        "",
        `${ICONS.pin} Acheter : ${cmd("shop buy <article>", ctx.prefix).replace("shop buy", "buy")}   Vendre : ${cmd("sell <article>", ctx.prefix)}`
      ],
      { icon: ICONS.money, footer: [`${ICONS.media} ${cmd("inventory", ctx.prefix)} pour voir tes objets`] }
    );
  }
};
