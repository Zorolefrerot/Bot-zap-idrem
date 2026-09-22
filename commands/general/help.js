"use strict";

/**
 * /help — aide globale, par catégorie ou par commande.
 *   /help            → toutes les catégories
 *   /help jeux       → les commandes de la catégorie
 *   /help ping       → le détail d'une commande
 */

const { box, lightBox, cmd, list, ICONS, smallcaps } = require("../../utils/text");

module.exports = {
  name: "help",
  aliases: ["aide", "commandes", "cmds"],
  category: "general",
  description: "Affiche l'aide : catégories, commandes d'une catégorie ou détail d'une commande.",
  usage: "/help [catégorie|commande]",
  examples: ["/help", "/help jeux", "/help ping"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { registry, text, permissions } = bag;
    const query = String(ctx.args[0] || "").trim().toLowerCase();
    const role = permissions.roleOf(ctx.senderID);
    const visible = registry.forLevel(role === "owner" ? "owner" : role === "admin" ? "admin" : "public");
    const prefix = ctx.prefix;

    if (!query) {
      const counts = new Map();
      for (const command of visible) counts.set(command.category, (counts.get(command.category) || 0) + 1);

      const lines = registry
        .categories()
        .filter((category) => counts.has(category.key))
        .map((category) => `${category.icon} ${category.label} — ${counts.get(category.key)} cmd`);

      return box(
        "AIDE",
        [
          `${ICONS.book} ${visible.length} commandes disponibles pour toi.`,
          "",
          text.branch(lines),
          "",
          `${ICONS.pin} ${cmd("help", prefix)} ${smallcaps("catégorie")} → détail (jeux, économie, social, fun…)`
        ],
        { footer: [`💡 ${cmd("menu", prefix)} affiche le menu complet, ${cmd("profile", prefix)} ton profil.`] }
      );
    }

    // 1. Une commande précise ?
    const command = registry.resolve(query);
    if (command) {
      const level = permissions.canExecute(command, ctx, { groupAdminIDs: ctx.groupAdminIDs, isGroup: ctx.isGroup });
      const roleLabels = { public: "👤 Tous", groupadmin: "🧭 Admin du groupe", admin: "🛡️ Administrateur", owner: "👑 Propriétaire" };
      const lines = [
        `${ICONS.info} ${command.description}`,
        "",
        `${text.kv("Catégorie", `${(registry.CATEGORIES[command.category] || {}).icon || ""} ${command.category}`, ICONS.pin)}`,
        text.kv("Droits", roleLabels[command.permissions] || command.permissions, ICONS.lock),
        text.kv("Cooldown", `${command.cooldown === null ? bag.config.limits.defaultCooldownSeconds : command.cooldown} s`, ICONS.clock),
        command.groupOnly ? "👥 Réservée aux groupes" : ""
      ].filter(Boolean);

      if (command.usage) lines.push("", text.kv("Usage", command.usage));
      if (command.aliases.length) lines.push(text.kv("Alias", command.aliases.map((a) => cmd(a, prefix)).join("  ")));
      if (command.examples.length) lines.push(text.kv("Exemples", command.examples.map((e) => cmd(e.replace(prefix, ""), prefix)).join("  ")));
      if (!level.allowed) lines.push("", `⛔ ${level.reason}`);

      return lightBox(`/${command.name}`, lines);
    }

    // 2. Une catégorie ?
    const category = registry.normalizeCategory(query);
    if (category) {
      const commands = visible.filter((c) => c.category === category && !c.hidden);
      if (!commands.length) {
        return box("AIDE", [`Aucune commande accessible dans la catégorie « ${query} » avec ton rôle.`]);
      }
      const meta = registry.CATEGORIES[category];
      return box(
        `${meta.label.toUpperCase()}`,
        [
          `${meta.icon} ${meta.description}`,
          "",
          list(commands.map((c) => `${cmd(c.name, prefix)} — ${c.description}`))
        ],
        { icon: meta.icon, footer: [`${commands.length} commande(s) • ${cmd("help", prefix)} pour les autres catégories`] }
      );
    }

    return box(
      "AIDE",
      [
        `❓ « ${query.slice(0, 24)} » n'est ni une commande ni une catégorie connue.`,
        "",
        `${ICONS.pin} Catégories : ${registry.categories().map((c) => c.key).join(", ")}`,
        `${ICONS.pin} Ou ${cmd("help", prefix)} ${smallcaps("commande")} pour le détail d'une commande.`
      ]
    );
  }
};
