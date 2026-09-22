"use strict";

/**
 * /mute — rend un utilisateur muet dans la conversation courante : le bot
 * ignore ses messages (commandes comprises) pendant la durée indiquée.
 *
 *   /mute <@personne|uid> [durée] [raison]
 *   durée : 30 | 30m | 2h | 1j   (défaut 10 min, plafond 24 h)
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { formatDuration } = require("../../utils/helpers");
const { target, parseMinutes, record } = require("../../utils/moderation");

module.exports = {
  name: "mute",
  aliases: ["silence", "taisezvous", "muette", "tempmute"],
  category: "admin",
  description: "Rend un utilisateur muet dans ce groupe pendant une durée donnée.",
  usage: "/mute <@personne|uid> [durée] [raison]",
  examples: ["/mute @quelquun 30m Spam", "/mute 100012345678901 2h", "/mute @quelquun"],
  permissions: "groupadmin",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services, permissions } = bag;
    const { id, name, explicit, rest } = target(ctx);

    if (!id || !explicit) {
      return lightBox("MUTE", [`${ICONS.warn} Indique qui rendre muet.`, "", `${ICONS.pin} ${cmd("mute @quelquun 30m raison", ctx.prefix)}`]);
    }
    if (id === ctx.senderID) return lightBox("MUTE", [`${ICONS.no} Tu ne peux pas te rendre muet toi-même.`]);
    if (services.warnings.isProtected(id) || permissions.isAdmin(id)) {
      return lightBox("MUTE", [`${ICONS.no} Cet utilisateur est protégé (propriétaire ou administrateur du bot).`]);
    }

    // Durée éventuelle en premier mot du reste (« 30m raison… »).
    const [durationWord, ...reasonWords] = rest.split(/\s+/);
    const parsed = parseMinutes(durationWord, 10);
    const minutes = parsed ? parsed.minutes : 10;
    const reason = parsed ? reasonWords.join(" ").trim() : rest.trim();

    if (durationWord && !parsed) {
      return lightBox("MUTE", [
        `${ICONS.warn} Durée illisible : « ${durationWord.slice(0, 12)} ».`,
        "",
        `${ICONS.pin} Formats acceptés : 30, 30m, 2h, 1j (maximum 24 h).`
      ]);
    }

    const existing = services.warnings.muteInfo(ctx.threadID, id);
    const result = services.warnings.mute(ctx.threadID, id, minutes, ctx.senderID, reason);
    if (!result.ok) return lightBox("MUTE", [`${ICONS.no} ${result.error}`]);

    record(bag, ctx, "mute", `${id} — ${minutes} min${reason ? ` — ${reason}` : ""}`);

    const lines = [
      `🔇 ${name || id} est muet pendant ${result.minutes} minute(s).`,
      reason ? `${ICONS.pin} Motif : ${reason.slice(0, 120)}` : "",
      `${ICONS.time} Fin : ${formatDuration(result.until - Date.now())} (le ${new Date(result.until).toLocaleTimeString("fr-FR")})`,
      existing ? `${ICONS.info} Un mute précédent a été remplacé.` : "",
      "",
      `${ICONS.info} Portée : cette conversation uniquement.`,
      `${ICONS.info} Annulation : ${cmd(`unmute ${id}`, ctx.prefix)}`
    ].filter((line) => line !== "");

    return box("MUTE", lines);
  }
};
