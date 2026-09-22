"use strict";

/**
 * /groupinfo — informations sur la conversation en cours.
 */

const { box, num, kv, cmd, ICONS, mono } = require("../../utils/text");

module.exports = {
  name: "groupinfo",
  aliases: ["group", "threadinfo", "infogroupe"],
  category: "general",
  description: "Affiche les informations de la conversation (groupe ou discussion privée).",
  usage: "/groupinfo",
  examples: ["/groupinfo"],
  permissions: "public",
  cooldown: 6,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const info = await services.groups.threadInfo(ctx.threadID);
    const record = services.groups.get(ctx.threadID);
    const settings = services.settings.get(ctx.threadID);

    const name = ctx.threadName || (info && info.ok && info.name) || record.name || (ctx.isGroup ? "Groupe" : "Discussion privée");
    const members = (info && info.ok && info.memberCount) || record.memberCount || ctx.memberCount || 0;
    const admins = (info && info.ok && info.adminIDs) || record.admins || [];

    const lines = [
      kv("Nom", String(name).slice(0, 40), ICONS.group),
      kv("Type", ctx.isGroup ? "Groupe" : "Discussion privée", ICONS.info),
      kv("ID", mono(ctx.threadID)),
      kv("Membres", members ? num(members) : "inconnu", ICONS.user),
      kv("Administrateurs", admins.length ? num(admins.length) : "aucun détecté", ICONS.lock),
      "",
      kv("Préfixe", cmd("", settings.prefix || config.prefix) || (settings.prefix || config.prefix), ICONS.gear),
      kv("Bienvenue", settings.welcome ? "✅ activée" : "⛔ désactivée", ICONS.pin),
      kv("Anti-lien", settings.antilink ? "✅ activé" : "⛔ désactivé", ICONS.pin),
      kv("Anti-spam", settings.antispam ? "✅ activé" : "⛔ désactivé", ICONS.pin),
      kv("Jeux", settings.games ? "✅ autorisés" : "⛔ bloqués", ICONS.game),
      kv("Conversation", settings.conversation ? "✅ active" : "⛔ silencieuse", ICONS.info),
      "",
      kv("Messages suivis", num(record.messages), ICONS.chart),
      kv("Commandes ici", num(record.commandsUsed), ICONS.bolt),
      kv("Bot présent depuis", new Date(record.joinedAt).toLocaleDateString("fr-FR"), ICONS.time)
    ];

    return box("CONVERSATION", lines, {
      footer: [`${ICONS.gear} ${cmd("settings", ctx.prefix)} pour modifier ces réglages`]
    });
  }
};
