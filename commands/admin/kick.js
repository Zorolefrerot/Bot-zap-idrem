"use strict";

/**
 * /kick — expulse un membre du groupe courant (API Messenger officielle :
 * removeUserFromGroup). Le bot doit être administrateur du groupe.
 *
 *   /kick <@personne|uid> [raison]
 *
 * Aucune expulsion n'est simulée : si Messenger refuse, le bot le dit.
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { callApiMethod } = require("../../utils/helpers");
const { target, record } = require("../../utils/moderation");

module.exports = {
  name: "kick",
  aliases: ["expulser", "remove", "eject"],
  category: "admin",
  description: "Expulse un membre du groupe courant (le bot doit être admin du groupe).",
  usage: "/kick <@personne|uid> [raison]",
  examples: ["/kick @quelquun Spam", "/kick 100012345678901"],
  permissions: "groupadmin",
  cooldown: 15,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services, permissions, logger } = bag;
    const { id, name, explicit, rest } = target(ctx);

    if (!id || !explicit) {
      return lightBox("EXPULSION", [`${ICONS.warn} Indique qui expulser (mention ou UID).`, "", `${ICONS.pin} ${cmd("kick @quelquun raison", ctx.prefix)}`]);
    }
    if (id === ctx.senderID) return lightBox("EXPULSION", [`${ICONS.no} Tu ne peux pas t'expulser toi-même via le bot.`]);
    if (id === ctx.botUserID) return lightBox("EXPULSION", [`${ICONS.no} Le bot ne s'expulse pas lui-même.`]);
    if (services.warnings.isProtected(id) || permissions.isAdmin(id)) {
      return lightBox("EXPULSION", [`${ICONS.no} Cet utilisateur est protégé (propriétaire ou administrateur du bot).`]);
    }
    if (ctx.participantIDs.length && !ctx.participantIDs.includes(id)) {
      return lightBox("EXPULSION", [`${ICONS.warn} ${name || id} n'est pas membre de ce groupe.`]);
    }

    const api = ctx.api;
    if (!api || typeof api.removeUserFromGroup !== "function") {
      return lightBox("EXPULSION", [
        `${ICONS.no} Cette version de l'API Messenger n'expose pas removeUserFromGroup.`,
        "",
        `${ICONS.info} Aucune expulsion n'est simulée. Alternative : ${cmd(`mute ${id} 60`, ctx.prefix)}.`
      ]);
    }

    await ctx.typing(700);
    let kicked = false;
    let failure = "";
    try {
      await callApiMethod(api.removeUserFromGroup.bind(api), [id, ctx.threadID], { timeoutMs: 20000 });
      kicked = true;
    } catch (err) {
      failure = String((err && (err.error || err.message)) || err).slice(0, 140);
      logger.warn(`Expulsion refusée (${failure}).`, "moderation");
    }

    if (!kicked) {
      return lightBox("EXPULSION", [
        `${ICONS.no} Messenger a refusé l'expulsion.`,
        failure ? `${ICONS.pin} Motif technique : ${failure}` : "",
        "",
        `${ICONS.info} Causes fréquentes : le bot n'est pas administrateur du groupe, ou la cible est admin.`,
        `${ICONS.pin} Alternative : ${cmd(`mute ${id} 60 ${rest || "calme-toi"}`, ctx.prefix)}`
      ].filter(Boolean));
    }

    services.warnings.recordKick(ctx.threadID, id, ctx.senderID, rest);
    record(bag, ctx, "kick", `${id}${rest ? ` — ${rest}` : ""}`);

    return box("EXPULSION", [
      `${ICONS.ok} ${name || id} a été expulsé du groupe.`,
      rest ? `${ICONS.pin} Motif : ${rest.slice(0, 120)}` : "",
      `${ICONS.user} UID : ${id}`,
      "",
      `${ICONS.info} Historique : ${cmd("admin mods", ctx.prefix)}`
    ].filter((line) => line !== ""));
  }
};
