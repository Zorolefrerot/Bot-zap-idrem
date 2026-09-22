"use strict";

/**
 * /warnings — consultation et gestion des avertissements du groupe.
 *   /warnings                     → tableau du groupe
 *   /warnings <@personne|uid>     → détail d'un membre
 *   /warnings clear <@personne|uid> → remise à zéro
 *   /warnings remove <uid> <n>    → retire un avertissement précis
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { target } = require("../../utils/moderation");

module.exports = {
  name: "warnings",
  aliases: ["warns", "avertissements", "warnlist"],
  category: "groups",
  description: "Consulte, retire ou efface les avertissements des membres du groupe.",
  usage: "/warnings [@personne|uid|clear <uid>|remove <uid> <n>]",
  examples: ["/warnings", "/warnings @quelquun", "/warnings clear @quelquun", "/warnings remove 100012345678901 2"],
  permissions: "groupadmin",
  cooldown: 8,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const first = String(ctx.args[0] || "").trim().toLowerCase();
    const max = services.warnings.maxWarns();

    // --- Effacement ----------------------------------------------------------
    if (first === "clear" || first === "reset" || first === "effacer") {
      const sub = target({ ...ctx, args: ctx.args.slice(1) });
      if (!sub.id || !sub.explicit) {
        return lightBox("AVERTISSEMENTS", [`${ICONS.warn} Indique pour qui effacer les avertissements.`, "", cmd("warnings clear @quelquun", ctx.prefix)]);
      }
      const before = services.warnings.warnCount(ctx.threadID, sub.id);
      const result = services.warnings.clearWarns(ctx.threadID, sub.id);
      if (!result.ok) return lightBox("AVERTISSEMENTS", [`${ICONS.no} ${result.error || "Effacement impossible."}`]);
      bag.logs.info("group", `Avertissements effacés : ${sub.id} (${before})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "warnings" });
      return box("AVERTISSEMENTS", [
        `${ICONS.ok} ${num(before)} avertissement(s) effacé(s) pour ${sub.name || sub.id}.`,
        `${ICONS.info} Le membre repart à zéro dans ce groupe.`
      ]);
    }

    // --- Retrait ciblé -------------------------------------------------------
    if (first === "remove" || first === "del" || first === "retirer") {
      const sub = target({ ...ctx, args: ctx.args.slice(1) });
      const index = Number(ctx.args[ctx.args.length - 1]);
      if (!sub.id || !sub.explicit || !Number.isFinite(index)) {
        return lightBox("AVERTISSEMENTS", [`${ICONS.warn} Usage attendu.`, "", cmd("warnings remove <uid> <numéro>", ctx.prefix)]);
      }
      const result = services.warnings.removeWarn(ctx.threadID, sub.id, index);
      if (!result.ok) return lightBox("AVERTISSEMENTS", [`${ICONS.no} ${result.error || "Avertissement introuvable."}`]);
      return box("AVERTISSEMENTS", [`${ICONS.ok} Avertissement n°${num(index)} retiré pour ${sub.name || sub.id}.`, `${ICONS.chart} Reste : ${num(services.warnings.warnCount(ctx.threadID, sub.id))}/${num(max)}`]);
    }

    // --- Détail d'un membre --------------------------------------------------
    if (first) {
      const sub = target(ctx);
      if (!sub.id) return lightBox("AVERTISSEMENTS", [`${ICONS.warn} Cible invalide.`]);
      const list = services.warnings.warns(ctx.threadID, sub.id);
      const lines = [`${ICONS.user} ${sub.name || ctx.displayName(sub.id)}`, `${ICONS.chart} ${num(list.length)}/${num(max)} avertissement(s)`];
      if (!list.length) lines.push("", `${ICONS.ok} Casier vierge dans ce groupe.`);
      else {
        lines.push("", ...list.map((entry, index) => `${index + 1}. ${entry.reason}${entry.by ? ` — par ${services.users.getName(entry.by) || entry.by.slice(-6)}` : ""} (${new Date(entry.at).toLocaleDateString("fr-FR")})`));
        lines.push("", `${ICONS.info} ${cmd(`warnings remove ${sub.id} <n>`, ctx.prefix)} • ${cmd(`warnings clear ${sub.id}`, ctx.prefix)}`);
      }
      return box("AVERTISSEMENTS", lines);
    }

    // --- Tableau du groupe ---------------------------------------------------
    const rows = services.warnings.threadWarns(ctx.threadID).sort((a, b) => b.count - a.count);
    if (!rows.length) {
      return box("AVERTISSEMENTS", [
        `${ICONS.ok} Aucun avertissement dans ${ctx.threadName || "ce groupe"}.`,
        "",
        `${ICONS.info} Seuil de sanction : ${num(max)} avertissements → mute de ${num(services.warnings.autoMuteMinutes())} minutes.`,
        `${ICONS.pin} ${cmd("warn @quelquun raison", ctx.prefix)}`
      ]);
    }

    return box("AVERTISSEMENTS DU GROUPE", [
      `${ICONS.group} ${ctx.threadName || "Ce groupe"} • ${num(rows.length)} membre(s) averti(s)`,
      `${ICONS.chart} Seuil : ${num(max)} → mute ${num(services.warnings.autoMuteMinutes())} min`,
      "",
      ...rows.slice(0, 15).map((row) => `• ${String(services.users.getName(row.userID) || row.userID).slice(0, 24)} — ${num(row.count)}/${num(max)}${row.last && row.last.reason ? ` (${String(row.last.reason).slice(0, 30)})` : ""}`),
      rows.length > 15 ? `… ${num(rows.length - 15)} autre(s).` : "",
      "",
      `${ICONS.info} Détail : ${cmd("warnings @quelquun", ctx.prefix)}`
    ].filter((line) => line !== ""));
  }
};
