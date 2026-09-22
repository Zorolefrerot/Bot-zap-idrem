"use strict";

/**
 * /welcome — message d'accueil des nouveaux membres.
 *   /welcome            → état
 *   /welcome on|off     → activation pour CE groupe
 *   /welcome test       → aperçu du message réellement envoyé
 *
 * L'envoi réel se fait sur l'événement Facebook « log:subscribe » (arrivée d'un
 * membre), traité par le dispatcher — pas par cette commande.
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "welcome",
  aliases: ["bienvenue", "accueil", "bonjour-nouveau"],
  category: "groups",
  description: "Active, désactive ou teste le message de bienvenue du groupe.",
  usage: "/welcome [on|off|test]",
  examples: ["/welcome", "/welcome on", "/welcome test"],
  permissions: "groupadmin",
  cooldown: 8,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();
    const settings = services.settings.get(ctx.threadID);

    if (arg === "test" || arg === "apercu" || arg === "aperçu") {
      const rendered = services.settings.render(settings.welcomeMsg, {
        userName: ctx.senderName || "Nouveau Membre",
        threadName: ctx.threadName || "ce groupe",
        memberCount: ctx.memberCount || 0
      });
      return box("APERÇU BIENVENUE", [
        rendered,
        "",
        `${ICONS.info} Voici exactement ce qui sera envoyé à l'arrivée d'un membre.`,
        `${ICONS.info} État actuel : ${settings.welcome ? "✅ activé" : "⛔ désactivé"} — ${cmd(`welcome ${settings.welcome ? "off" : "on"}`, ctx.prefix)}`
      ]);
    }

    if (arg) {
      const result = services.settings.set(ctx.threadID, "welcome", arg, { by: ctx.senderID });
      if (!result.ok) {
        return lightBox("BIENVENUE", [`${ICONS.warn} ${result.error}`, "", `${ICONS.pin} ${cmd("welcome on", ctx.prefix)} • ${cmd("welcome off", ctx.prefix)} • ${cmd("welcome test", ctx.prefix)}`]);
      }
      bag.logs.info("group", `Bienvenue ${result.value ? "activée" : "désactivée"} (${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "welcome" });
      return box("BIENVENUE", [
        `${result.value ? ICONS.ok : ICONS.no} Message de bienvenue ${result.value ? "activé" : "désactivé"} pour ce groupe.`,
        "",
        `${ICONS.pin} Contenu : ${cmd("setwelcome <texte>", ctx.prefix)}`,
        `${ICONS.info} Aperçu : ${cmd("welcome test", ctx.prefix)}`
      ]);
    }

    return box("BIENVENUE", [
      `${settings.welcome ? `${ICONS.ok} Activée` : `${ICONS.no} Désactivée`} pour ${ctx.threadName || "ce groupe"}`,
      "",
      `${ICONS.book} Message actuel :`,
      String(settings.welcomeMsg).slice(0, 220),
      "",
      `${ICONS.info} Placeholders : {name} {group} {count} {bot}`,
      `${ICONS.pin} ${cmd("welcome on|off", ctx.prefix)} • ${cmd("welcome test", ctx.prefix)} • ${cmd("setwelcome <texte>", ctx.prefix)}`
    ]);
  }
};
