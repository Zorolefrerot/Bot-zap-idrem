"use strict";

/**
 * /goodbye — message de départ des membres (pendant de /welcome).
 *   /goodbye            → état
 *   /goodbye on|off     → activation pour CE groupe
 *   /goodbye test       → aperçu du message réellement envoyé
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "goodbye",
  aliases: ["aurevoir", "au-revoir", "depart", "départ"],
  category: "groups",
  description: "Active, désactive ou teste le message d'au revoir du groupe.",
  usage: "/goodbye [on|off|test]",
  examples: ["/goodbye", "/goodbye on", "/goodbye test"],
  permissions: "groupadmin",
  cooldown: 8,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();
    const settings = services.settings.get(ctx.threadID);

    if (arg === "test" || arg === "apercu" || arg === "aperçu") {
      const rendered = services.settings.render(settings.goodbyeMsg, {
        userName: ctx.senderName || "Un membre",
        threadName: ctx.threadName || "ce groupe",
        memberCount: ctx.memberCount || 0
      });
      return box("APERÇU AU REVOIR", [
        rendered,
        "",
        `${ICONS.info} Voici ce qui sera envoyé au départ d'un membre.`,
        `${ICONS.info} État : ${settings.goodbye ? "✅ activé" : "⛔ désactivé"} — ${cmd(`goodbye ${settings.goodbye ? "off" : "on"}`, ctx.prefix)}`
      ]);
    }

    if (arg) {
      const result = services.settings.set(ctx.threadID, "goodbye", arg, { by: ctx.senderID });
      if (!result.ok) {
        return lightBox("AU REVOIR", [`${ICONS.warn} ${result.error}`, "", `${ICONS.pin} ${cmd("goodbye on|off|test", ctx.prefix)}`]);
      }
      bag.logs.info("group", `Au revoir ${result.value ? "activé" : "désactivé"} (${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "goodbye" });
      return box("AU REVOIR", [
        `${result.value ? ICONS.ok : ICONS.no} Message d'au revoir ${result.value ? "activé" : "désactivé"} pour ce groupe.`,
        "",
        `${ICONS.pin} Contenu : ${cmd("setgoodbye <texte>", ctx.prefix)}`,
        `${ICONS.info} Aperçu : ${cmd("goodbye test", ctx.prefix)}`
      ]);
    }

    return box("AU REVOIR", [
      `${settings.goodbye ? `${ICONS.ok} Activé` : `${ICONS.no} Désactivé`} pour ${ctx.threadName || "ce groupe"}`,
      "",
      `${ICONS.book} Message actuel :`,
      String(settings.goodbyeMsg).slice(0, 220),
      "",
      `${ICONS.info} Placeholders : {name} {group} {count} {bot}`,
      `${ICONS.pin} ${cmd("goodbye on|off", ctx.prefix)} • ${cmd("goodbye test", ctx.prefix)} • ${cmd("setgoodbye <texte>", ctx.prefix)}`
    ]);
  }
};
