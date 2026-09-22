"use strict";

/**
 * /menu — arborescence complète des catégories avec exemples.
 */

const { box, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "menu",
  aliases: ["categories", "catégories"],
  category: "general",
  description: "Affiche le menu complet : toutes les catégories et leurs commandes phares.",
  usage: "/menu [catégorie]",
  examples: ["/menu", "/menu jeux"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const { registry, permissions } = bag;
    const role = permissions.roleOf(ctx.senderID);
    const visible = registry.forLevel(role === "owner" ? "owner" : role === "admin" ? "admin" : "public");
    const prefix = ctx.prefix;
    const filter = registry.normalizeCategory(ctx.args[0] || "");

    const counts = new Map();
    for (const command of visible) counts.set(command.category, (counts.get(command.category) || 0) + 1);

    const categories = registry.categories().filter((c) => counts.has(c.key) && (!filter || c.key === filter));
    if (!categories.length) return box("MENU", ["Aucune catégorie accessible avec ton rôle."]);

    const lines = [];
    for (const category of categories) {
      const commands = visible
        .filter((c) => c.category === category.key && !c.hidden)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => cmd(c.name, prefix));
      lines.push(`${category.icon} ${category.label} ${"─".repeat(Math.max(1, 14 - category.label.length))} ${commands.length}`);
      // Affichage par lignes de 3 commandes pour rester lisible sur téléphone.
      for (let i = 0; i < commands.length; i += 3) {
        lines.push(`   ${commands.slice(i, i + 3).join("  ")}`);
      }
      lines.push("");
    }

    return box("MENU", lines.filter((line, index, all) => !(line === "" && index === all.length - 1)), {
      icon: ICONS.bolt,
      footer: [
        `${visible.length} commandes accessibles • rôle : ${permissions.roleOf(ctx.senderID)}`,
        `${ICONS.book} ${cmd("help", prefix)} <catégorie> pour le détail`
      ]
    });
  }
};
