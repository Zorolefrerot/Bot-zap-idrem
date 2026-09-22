"use strict";

/**
 * /warn — avertissement officiel d'un membre dans ce groupe.
 *   /warn <@personne|uid> [raison]
 *
 * Au dernier avertissement (config.limits.maxWarns), le service applique
 * automatiquement un mute temporaire : sanction réelle, jamais simulée.
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { target, record } = require("../../utils/moderation");

module.exports = {
  name: "warn",
  aliases: ["avertir", "avertissement", "warning"],
  category: "groups",
  description: "Donne un avertissement à un membre (mute automatique au seuil défini).",
  usage: "/warn <@personne|uid> [raison]",
  examples: ["/warn @quelquun Spam", "/warn 100012345678901 Insultes"],
  permissions: "groupadmin",
  cooldown: 10,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services, permissions } = bag;
    const { id, name, explicit, rest } = target(ctx);

    if (!id || !explicit) {
      return lightBox("AVERTISSEMENT", [
        `${ICONS.warn} Indique qui avertir (mention ou UID).`,
        "",
        `${ICONS.pin} ${cmd("warn @quelquun raison", ctx.prefix)}`,
        `${ICONS.pin} Historique : ${cmd("warnings <@quelquun>", ctx.prefix)}`
      ]);
    }
    if (id === ctx.senderID) return lightBox("AVERTISSEMENT", [`${ICONS.no} Tu ne peux pas t'avertir toi-même.`]);
    if (services.warnings.isProtected(id)) return lightBox("AVERTISSEMENT", [`${ICONS.no} Le propriétaire du bot ne peut pas être averti.`]);
    if (permissions.isAdmin(id)) return lightBox("AVERTISSEMENT", [`${ICONS.no} Un administrateur du bot ne peut pas être averti.`]);
    if (ctx.groupAdminIDs.includes(id) && !permissions.isAdmin(ctx.senderID)) {
      return lightBox("AVERTISSEMENT", [`${ICONS.no} Seul un administrateur du bot peut avertir un admin de groupe.`]);
    }

    const result = services.warnings.addWarn(ctx.threadID, id, rest || "non précisé", ctx.senderID);
    if (!result.ok) return lightBox("AVERTISSEMENT", [`${ICONS.no} ${result.error}`]);

    record(bag, ctx, "warn", `${id} (${result.total}/${result.max})${rest ? ` — ${rest}` : ""}`);

    // Notification directe à l'utilisateur averti (MP), si possible.
    await bag.sendTo(
      id,
      `⚠️ Tu as reçu un avertissement dans ${ctx.threadName || "un groupe"}.\n${rest ? `Motif : ${rest}\n` : ""}Total : ${result.total}/${result.max}.${result.autoAction ? `\n🔇 Sanction automatique : muet ${result.autoAction.minutes} minutes.` : ""}`
    );

    const lines = [
      `${ICONS.warn} ${name || id} a reçu un avertissement.`,
      `${ICONS.pin} Motif : ${rest ? rest.slice(0, 120) : "non précisé"}`,
      `${ICONS.chart} Total : ${num(result.total)}/${num(result.max)}`
    ];

    if (result.autoAction) {
      lines.push("", `${ICONS.no} Seuil atteint → mute automatique de ${num(result.autoAction.minutes)} minutes.`, `${ICONS.info} Les avertissements ont été remis à zéro.`);
    } else {
      lines.push("", `${ICONS.info} Au ${num(result.max)}ᵉ avertissement : mute automatique de ${num(services.warnings.autoMuteMinutes())} minutes.`);
    }
    lines.push(`${ICONS.pin} Historique : ${cmd(`warnings ${id}`, ctx.prefix)}`);

    return box("AVERTISSEMENT", lines);
  }
};
