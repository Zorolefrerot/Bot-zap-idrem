"use strict";

/**
 * /tagall — mentionne tous les membres du groupe (mentions Facebook réelles).
 *
 * Réservé aux administrateurs du groupe, limité à 50 mentions par message et
 * soumis à un cooldown long : c'est la commande la plus « bruyante » du bot.
 *
 *   /tagall [message]
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

const MAX_MENTIONS = 50;
const COOLDOWN_MINUTES = 2;

module.exports = {
  name: "tagall",
  aliases: ["all", "mentionall", "tous", "pingall"],
  category: "groups",
  description: "Mentionne tous les membres du groupe (admins uniquement, limité à 50 mentions).",
  usage: "/tagall [message]",
  examples: ["/tagall", "/tagall Réunion à 20 h !"],
  permissions: "groupadmin",
  cooldown: COOLDOWN_MINUTES * 60,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const message = ctx.argString.trim();

    const info = await services.groups.threadInfo(ctx.threadID);
    if (!info.ok) return lightBox("TAGALL", [`${ICONS.warn} Impossible de lire la liste des membres (${info.error}).`]);

    const participants = (Array.isArray(info.participantIDs) ? info.participantIDs : []).filter((id) => id !== ctx.botUserID);
    if (!participants.length) {
      return lightBox("TAGALL", [
        `${ICONS.warn} Facebook n'a renvoyé aucun participant.`,
        "",
        `${ICONS.info} Sans liste réelle, le bot ne mentionne personne (pas de mentions inventées).`
      ]);
    }

    const selected = participants.slice(0, MAX_MENTIONS);
    const tagByUser = {};
    selected.forEach((id, index) => {
      tagByUser[id] = `@${index + 1}`;
    });

    const header = message ? `📣 ${message}` : `📣 ${ctx.senderName || "Un administrateur"} appelle tout le groupe.`;
    const body = `${header}\n\n${selected.map((id, index) => `@${index + 1}`).join(" ")}\n\n${ICONS.group} ${num(selected.length)} membre(s) mentionné(s)${participants.length > selected.length ? ` sur ${num(participants.length)} (limite ${MAX_MENTIONS})` : ""}`;

    const sent = await ctx.send(ctx.mentionPayload(tagByUser, body));
    if (!sent) {
      return lightBox("TAGALL", [
        `${ICONS.warn} Messenger a refusé l'envoi des mentions.`,
        "",
        `${ICONS.info} Cause fréquente : trop de mentions d'un coup, ou débit limité.`,
        `${ICONS.pin} Réessaie dans quelques minutes (cooldown de ${COOLDOWN_MINUTES} min).`
      ]);
    }

    bag.logs.info("group", `tagall : ${selected.length} mention(s) dans ${ctx.threadID}`, { userID: ctx.senderID, threadID: ctx.threadID, command: "tagall" });
    return "";
  }
};
