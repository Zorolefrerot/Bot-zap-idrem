"use strict";

/**
 * /unban — lève un bannissement.
 *   /unban <uid>            → déban
 *   /unban list             → liste des bannis
 *   /unban clear            → débanne tout (confirmé par --force)
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { target, record } = require("../../utils/moderation");

module.exports = {
  name: "unban",
  aliases: ["deban", "débannir", "unbanuser"],
  category: "admin",
  description: "Lève le bannissement d'un utilisateur (ou liste les bannis).",
  usage: "/unban <uid|list|clear>",
  examples: ["/unban 100012345678901", "/unban list"],
  permissions: "admin",
  cooldown: 8,

  async execute(ctx, bag) {
    const { services } = bag;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    if (arg === "list" || arg === "liste") {
      const banned = services.warnings.bannedList();
      if (!banned.length) return lightBox("BANNIS", [`${ICONS.ok} Aucun utilisateur banni.`]);
      return box("UTILISATEURS BANNIS", [
        `${ICONS.no} ${num(banned.length)} bannissement(s)`,
        "",
        ...banned.slice(0, 20).map((entry) => `• ${entry.userID}${entry.reason ? ` — ${entry.reason.slice(0, 40)}` : ""}`),
        banned.length > 20 ? `… et ${num(banned.length - 20)} autre(s).` : "",
        "",
        `${ICONS.info} ${cmd("unban <uid>", ctx.prefix)} pour lever une sanction.`
      ].filter((line) => line !== ""));
    }

    if (arg === "clear" || arg === "all") {
      const banned = services.warnings.bannedList();
      if (!banned.length) return lightBox("BANNIS", [`${ICONS.ok} Aucun utilisateur banni.`]);
      if (!ctx.args.some((a) => String(a).toLowerCase() === "--force")) {
        return lightBox("BANNIS", [
          `${ICONS.warn} Cette action lève ${num(banned.length)} bannissement(s) d'un coup.`,
          "",
          `${ICONS.pin} Confirme avec : ${cmd("unban clear --force", ctx.prefix)}`
        ]);
      }
      let count = 0;
      for (const entry of banned) {
        if (services.warnings.unban(entry.userID).ok) count += 1;
      }
      record(bag, ctx, "unban-clear", `${count} bannissement(s) levé(s)`);
      return box("BANNISSEMENTS LEVÉS", [`${ICONS.ok} ${num(count)} utilisateur(s) débanni(s).`]);
    }

    const { id, name, explicit } = target(ctx);
    if (!id || !explicit) {
      return lightBox("DÉBANNISSEMENT", [
        `${ICONS.warn} Indique l'UID à débannir.`,
        "",
        `${ICONS.pin} ${cmd("unban <uid>", ctx.prefix)} • ${cmd("unban list", ctx.prefix)}`
      ]);
    }

    const result = services.warnings.unban(id);
    if (!result.ok) return lightBox("DÉBANNISSEMENT", [`${ICONS.warn} ${result.error}`, "", `${ICONS.pin} ${cmd("unban list", ctx.prefix)}`]);

    record(bag, ctx, "unban", id);
    await bag.sendTo(id, `✅ Ton bannissement de ${bag.config.identity.name} a été levé. Les commandes sont de nouveau disponibles.`);

    return box("DÉBANNISSEMENT", [`${ICONS.ok} ${name || id} peut de nouveau utiliser le bot.`, `${ICONS.user} UID : ${id}`]);
  }
};
