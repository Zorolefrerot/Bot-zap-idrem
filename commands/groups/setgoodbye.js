"use strict";

/**
 * /setgoodbye — personnalise le message de départ d'un membre.
 *   /setgoodbye <texte>   → nouveau modèle
 *   /setgoodbye reset     → modèle par défaut
 *   /setgoodbye preview   → rendu réel
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

const PLACEHOLDERS = ["{name}", "{group}", "{count}", "{bot}"];

module.exports = {
  name: "setgoodbye",
  aliases: ["goodbyemsg", "au-revoir-msg", "setau-revoir", "setaurevoir"],
  category: "groups",
  description: "Définit le message d'au revoir du groupe (avec placeholders).",
  usage: "/setgoodbye <texte|reset|preview>",
  examples: ["/setgoodbye 🚪 {name} a quitté {group}.", "/setgoodbye reset"],
  permissions: "groupadmin",
  cooldown: 8,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const settings = services.settings.get(ctx.threadID);
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    const context = {
      userName: ctx.senderName || "Un membre",
      threadName: ctx.threadName || "ce groupe",
      memberCount: ctx.memberCount || 0
    };

    if (arg === "preview" || arg === "apercu" || arg === "aperçu") {
      return box("APERÇU AU REVOIR", [
        services.settings.render(settings.goodbyeMsg, context),
        "",
        `${ICONS.info} Aperçu généré avec les données réelles de ce groupe.`,
        `${ICONS.pin} État : ${settings.goodbye ? "✅ activé" : "⛔ désactivé"} — ${cmd(`goodbye ${settings.goodbye ? "off" : "on"}`, ctx.prefix)}`
      ]);
    }

    if (!ctx.argString.trim()) {
      return lightBox("MESSAGE D'AU REVOIR", [
        `${ICONS.warn} Aucun texte fourni.`,
        "",
        `${ICONS.pin} ${cmd("setgoodbye 🚪 {name} a quitté {group}.", ctx.prefix)}`,
        `${ICONS.pin} ${cmd("setgoodbye reset", ctx.prefix)} • ${cmd("setgoodbye preview", ctx.prefix)}`,
        `${ICONS.info} Placeholders : ${PLACEHOLDERS.join(" ")}`,
        `${ICONS.info} L'activation se fait avec ${cmd("goodbye on", ctx.prefix)}.`
      ]);
    }

    if (arg === "reset") {
      const defaut = services.settings.defaults().goodbyeMsg;
      const result = services.settings.set(ctx.threadID, "goodbyeMsg", defaut, { by: ctx.senderID });
      if (!result.ok) return lightBox("MESSAGE D'AU REVOIR", [`${ICONS.no} ${result.error}`]);
      return box("MESSAGE D'AU REVOIR", [`${ICONS.ok} Modèle par défaut rétabli.`, "", result.value]);
    }

    const text = ctx.argString.trim();
    if (text.length > 400) return lightBox("MESSAGE D'AU REVOIR", [`${ICONS.no} Trop long (400 caractères maximum).`]);

    const result = services.settings.set(ctx.threadID, "goodbyeMsg", text, { by: ctx.senderID });
    if (!result.ok) return lightBox("MESSAGE D'AU REVOIR", [`${ICONS.no} ${result.error}`]);

    bag.logs.info("group", `Message d'au revoir personnalisé (${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "setgoodbye" });

    return box("MESSAGE D'AU REVOIR", [
      `${ICONS.ok} Message d'au revoir enregistré.`,
      "",
      services.settings.render(result.value, context),
      "",
      settings.goodbye ? `${ICONS.ok} L'envoi est activé pour ce groupe.` : `${ICONS.warn} L'envoi est désactivé : active-le avec la commande d'événement du groupe.`
    ]);
  }
};
