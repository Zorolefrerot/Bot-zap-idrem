"use strict";

/**
 * /language — langue des MESSAGES SYSTÈME du bot pour ce groupe.
 *
 * Périmètre réel (utils/i18n.js), affiché sans ambiguïté :
 *   • message « / » seul          • commande inconnue
 *   • accès refusé / groupe requis • cooldown
 *   • anti-spam, banni, muet       • erreur générique, maintenance
 *
 * Les 100+ commandes, leurs descriptions et le corpus restent en français :
 * le bot l'annonce explicitement plutôt que de faire semblant d'être bilingue.
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const i18n = require("../../utils/i18n");

module.exports = {
  name: "language",
  aliases: ["langue", "lang", "setlanguage", "setlang"],
  category: "config",
  description: "Choisit la langue des messages système du bot pour ce groupe (fr / en).",
  usage: "/language [fr|en]",
  examples: ["/language", "/language en", "/language fr"],
  permissions: "groupadmin",
  cooldown: 8,

  async execute(ctx, bag) {
    const { services, permissions } = bag;
    const current = services.settings.get(ctx.threadID).language;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    const scope = (lang) => [
      `${ICONS.pin} Traduit dans cette langue :`,
      "   • message « / » seul et commande inconnue",
      "   • accès refusé, groupe requis, cooldown",
      "   • anti-spam, bannissement, mute, maintenance",
      "   • message d'erreur générique",
      "",
      `${ICONS.warn} Reste en français : descriptions des ${cmd("menu", ctx.prefix)} catégories, jeux, économie et réponses conversationnelles.`
    ];

    if (!arg) {
      const entry = i18n.LANGUAGES[current] || i18n.LANGUAGES.fr;
      return box("LANGUE", [
        `🌍 Langue actuelle de ce groupe : ${entry.flag} ${entry.label} (${entry.code})`,
        "",
        ...scope(current),
        "",
        `${ICONS.gear} Changer : ${i18n.SUPPORTED.map((code) => cmd(`language ${code}`, ctx.prefix)).join(" • ")}`
      ]);
    }

    if (!i18n.SUPPORTED.includes(arg)) {
      return lightBox("LANGUE", [
        `${ICONS.no} Langue non prise en charge : « ${arg.slice(0, 10)} ».`,
        "",
        `${ICONS.pin} Disponibles : ${i18n.SUPPORTED.map((code) => `${i18n.LANGUAGES[code].flag} ${code}`).join(" • ")}`,
        `${ICONS.info} Le bot n'annonce jamais une langue qu'il ne parle pas réellement.`
      ]);
    }

    if (!permissions.isGroupAdmin(ctx.senderID, ctx.groupAdminIDs)) {
      return bag.text.denied("groupadmin", "Seuls les administrateurs du groupe changent sa langue.");
    }

    const result = services.settings.set(ctx.threadID, "language", arg, { by: ctx.senderID });
    if (!result.ok) return lightBox("LANGUE", [`${ICONS.no} ${result.error}`]);

    bag.logs.info("settings", `Langue du groupe ${ctx.threadID} = ${arg}`, { userID: ctx.senderID, threadID: ctx.threadID, command: "language" });
    const entry = i18n.LANGUAGES[arg];

    return box("LANGUE", [
      `${ICONS.ok} Langue de ce groupe : ${entry.flag} ${entry.label}`,
      "",
      ...scope(arg),
      "",
      `${ICONS.info} Test immédiat : envoie ${cmd("", ctx.prefix)} (le préfixe seul).`,
      `${ICONS.group} Portée : ${ctx.threadName || "ce groupe"} uniquement.`
    ]);
  }
};
