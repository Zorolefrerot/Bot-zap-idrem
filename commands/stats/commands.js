"use strict";

/**
 * /commands — catalogue des commandes disponibles pour TON rôle.
 *   /commands            → toutes les commandes accessibles, par catégorie
 *   /commands <catégorie> → une seule catégorie
 *   /commands search <mot> → recherche par nom, alias ou description
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "commands",
  aliases: ["commandlist", "listcommands", "allcommands"],
  category: "stats",
  description: "Liste les commandes que tu peux utiliser, par catégorie, avec recherche.",
  usage: "/commands [catégorie|search <mot>]",
  examples: ["/commands", "/commands economy", "/commands search musique"],
  permissions: "public",
  cooldown: 8,

  async execute(ctx, bag) {
    const { registry, permissions } = bag;
    const role = permissions.roleOf(ctx.senderID);
    const accessible = registry.forLevel(role === "user" ? (ctx.groupAdminIDs.includes(ctx.senderID) ? "groupadmin" : "public") : role);
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    // --- Recherche ------------------------------------------------------------
    if (arg === "search" || arg === "recherche" || arg === "find") {
      const needle = ctx.args.slice(1).join(" ").trim().toLowerCase();
      if (!needle) return lightBox("RECHERCHE", [`${ICONS.warn} Précise un mot à chercher.`, "", cmd("commands search musique", ctx.prefix)]);

      const found = accessible.filter((command) => {
        const haystack = [command.name, ...(command.aliases || []), command.description, command.category].join(" ").toLowerCase();
        return haystack.includes(needle);
      });

      if (!found.length) {
        return lightBox("RECHERCHE", [
          `${ICONS.warn} Aucune commande accessible ne correspond à « ${needle.slice(0, 24)} ».`,
          "",
          `${ICONS.pin} Essaie un mot plus court, ou ${cmd("commands", ctx.prefix)} pour tout voir.`,
          `${ICONS.info} Certaines commandes sont réservées aux administrateurs et n'apparaissent pas ici.`
        ]);
      }

      return box(`RECHERCHE — ${needle.slice(0, 20).toUpperCase()}`, [
        `${ICONS.chart} ${num(found.length)} commande(s) trouvée(s)`,
        "",
        ...found.slice(0, 15).map((command) => `${cmd(command.name, ctx.prefix)} — ${command.description}`),
        found.length > 15 ? `… ${num(found.length - 15)} autre(s).` : ""
      ].filter((line) => line !== ""));
    }

    // --- Une catégorie --------------------------------------------------------
    if (arg) {
      const category = registry.normalizeCategory(arg);
      if (!category) {
        const close = registry.categories().filter((entry) => entry.key.startsWith(arg.slice(0, 3)) || String(entry.label || "").toLowerCase().includes(arg));
        return lightBox("COMMANDES", [
          `${ICONS.warn} Catégorie inconnue : « ${arg.slice(0, 20)} ».`,
          "",
          close.length
            ? `${ICONS.pin} Peut-être : ${close.map((entry) => cmd(`commands ${entry.key}`, ctx.prefix)).join(" • ")}`
            : `${ICONS.pin} ${cmd("commands", ctx.prefix)} pour la liste des catégories.`
        ]);
      }
      const list = accessible.filter((command) => command.category === category);
      const meta = registry.categories().find((entry) => entry.key === category) || { label: category, icon: ICONS.book };
      if (!list.length) {
        return lightBox(String(meta.label || category).toUpperCase(), [
          `${ICONS.lock} Aucune commande de cette catégorie n'est accessible avec ton rôle.`,
          "",
          `${ICONS.info} Rôle actuel : ${role}.`
        ]);
      }
      return box(String(meta.label || category).toUpperCase(), [
        `${meta.icon || ICONS.book} ${num(list.length)} commande(s) accessible(s)`,
        "",
        ...list.map((command) => `${cmd(command.name, ctx.prefix)}${command.usage && command.usage !== `/${command.name}` ? ` ${command.usage.split(" ").slice(1).join(" ")}` : ""}\n   ${command.description}`),
        "",
        `${ICONS.info} ${cmd("commands", ctx.prefix)} pour toutes les catégories.`
      ], { icon: meta.icon });
    }

    // --- Tout -----------------------------------------------------------------
    const categories = registry.categories();
    const lines = [
      `${ICONS.chart} ${num(accessible.length)} commande(s) accessible(s) sur ${num(registry.count())} • rôle ${role}`,
      ""
    ];

    for (const entry of categories) {
      const list = accessible.filter((command) => command.category === entry.key);
      if (!list.length) continue;
      lines.push(`${entry.icon || ICONS.book} ${entry.label || entry.key} (${num(list.length)})`);
      lines.push(`   ${list.map((command) => command.name).join(" • ")}`);
      lines.push("");
    }

    lines.push(`${ICONS.pin} Détail d'une catégorie : ${cmd("commands <catégorie>", ctx.prefix)}`);
    lines.push(`${ICONS.info} Recherche : ${cmd("commands search <mot>", ctx.prefix)}`);
    lines.push(`${ICONS.lock} Les commandes d'administration ne s'affichent que si tu y as droit.`);

    return box("COMMANDES", lines);
  }
};
