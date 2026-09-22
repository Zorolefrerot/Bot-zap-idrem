"use strict";

/**
 * /setwelcome — personnalise le message de bienvenue du groupe.
 *   /setwelcome <texte>   → nouveau modèle
 *   /setwelcome reset     → modèle par défaut
 *   /setwelcome preview   → rendu avec les vraies données du groupe
 *
 * Placeholders réels : {name} {group} {count} {bot}
 * (rendus par services/settings.render au moment de l'événement).
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

const PLACEHOLDERS = ["{name}", "{group}", "{count}", "{bot}"];

module.exports = {
  name: "setwelcome",
  aliases: ["welcomemsg", "bienvenue-msg", "setbienvenue"],
  category: "groups",
  description: "Définit le message de bienvenue du groupe (avec placeholders).",
  usage: "/setwelcome <texte|reset|preview>",
  examples: ["/setwelcome 👋 Bienvenue {name} dans {group} ! Fais /menu.", "/setwelcome reset", "/setwelcome preview"],
  permissions: "groupadmin",
  cooldown: 8,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const settings = services.settings.get(ctx.threadID);
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    const context = {
      userName: ctx.senderName || "Nouveau Membre",
      threadName: ctx.threadName || "ce groupe",
      memberCount: ctx.memberCount || 0
    };

    if (arg === "preview" || arg === "apercu" || arg === "aperçu") {
      return box("APERÇU BIENVENUE", [
        services.settings.render(settings.welcomeMsg, context),
        "",
        `${ICONS.info} Aperçu généré avec les données réelles de ce groupe.`,
        `${ICONS.pin} État : ${settings.welcome ? "✅ activé" : "⛔ désactivé"} — ${cmd(`welcome ${settings.welcome ? "off" : "on"}`, ctx.prefix)}`
      ]);
    }

    if (!ctx.argString.trim()) {
      return lightBox("MESSAGE DE BIENVENUE", [
        `${ICONS.warn} Aucun texte fourni.`,
        "",
        `${ICONS.pin} ${cmd("setwelcome 👋 Bienvenue {name} dans {group} !", ctx.prefix)}`,
        `${ICONS.pin} ${cmd("setwelcome reset", ctx.prefix)} • ${cmd("setwelcome preview", ctx.prefix)}`,
        `${ICONS.info} Placeholders : ${PLACEHOLDERS.join(" ")}`
      ]);
    }

    if (arg === "reset") {
      const defaut = services.settings.defaults().welcomeMsg;
      const result = services.settings.set(ctx.threadID, "welcomeMsg", defaut, { by: ctx.senderID });
      if (!result.ok) return lightBox("MESSAGE DE BIENVENUE", [`${ICONS.no} ${result.error}`]);
      return box("MESSAGE DE BIENVENUE", [`${ICONS.ok} Modèle par défaut rétabli.`, "", result.value, "", `${ICONS.info} ${cmd("setwelcome preview", ctx.prefix)} pour vérifier le rendu.`]);
    }

    const text = ctx.argString.trim();
    if (text.length > 400) return lightBox("MESSAGE DE BIENVENUE", [`${ICONS.no} Trop long (400 caractères maximum) : ${text.length} fournis.`]);

    const result = services.settings.set(ctx.threadID, "welcomeMsg", text, { by: ctx.senderID });
    if (!result.ok) return lightBox("MESSAGE DE BIENVENUE", [`${ICONS.no} ${result.error}`]);

    bag.logs.info("group", `Message de bienvenue personnalisé (${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "setwelcome" });
    const used = PLACEHOLDERS.filter((placeholder) => result.value.includes(placeholder));

    return box("MESSAGE DE BIENVENUE", [
      `${ICONS.ok} Message de bienvenue enregistré pour ce groupe.`,
      "",
      services.settings.render(result.value, context),
      "",
      used.length ? `${ICONS.pin} Placeholders détectés : ${used.join(" ")}` : `${ICONS.warn} Aucun placeholder : le message sera identique pour tout le monde.`,
      settings.welcome ? "" : `${ICONS.warn} La bienvenue est désactivée : ${cmd("welcome on", ctx.prefix)}.`
    ].filter((line) => line !== ""));
  }
};
