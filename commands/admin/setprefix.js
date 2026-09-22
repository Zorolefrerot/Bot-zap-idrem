"use strict";

/**
 * /setprefix — change le préfixe des commandes.
 *
 *   /setprefix            → affiche le préfixe effectif (groupe → global → config)
 *   /setprefix !          → préfixe de CE GROUPE (admin du groupe)
 *   /setprefix reset      → revient au préfixe global
 *   /setprefix global !   → préfixe global du bot (admin du bot uniquement)
 *
 * Le préfixe global est persisté dans data/settings.json (clé « global ») :
 * il survit au redémarrage sans modifier config.json ni les variables Render.
 */

const { box, lightBox, cmd, denied, ICONS } = require("../../utils/text");

module.exports = {
  name: "setprefix",
  aliases: ["prefix", "prefixe", "préfixe", "changeprefix"],
  category: "admin",
  description: "Affiche ou change le préfixe des commandes (ce groupe, ou global pour les admins).",
  usage: "/setprefix [global] <nouveau préfixe|reset>",
  examples: ["/setprefix", "/setprefix !", "/setprefix global ?", "/setprefix reset"],
  permissions: "groupadmin",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services, config, permissions } = bag;
    const args = ctx.args.map((a) => String(a).trim());
    const scope = String(args[0] || "").toLowerCase();

    // --- Affichage de l'état -------------------------------------------------
    if (!args.length) {
      const local = String(services.settings.get(ctx.threadID).prefix || "");
      const global = services.settings.globalOverrides().prefix || "";
      return box("PRÉFIXE", [
        `${ICONS.pin} Effectif ici : ${cmd("", ctx.prefix) || ctx.prefix}`,
        local ? `${ICONS.group} Préfixe du groupe : ${local}` : `${ICONS.group} Préfixe du groupe : (hérite du global)`,
        global ? `${ICONS.gear} Préfixe global : ${global}` : `${ICONS.gear} Préfixe global : ${config.prefix} (config)`,
        "",
        `${ICONS.info} ${cmd("setprefix !", ctx.prefix)} → change ce groupe`,
        `${ICONS.info} ${cmd("setprefix global !", ctx.prefix)} → change tout le bot (admins)`,
        `${ICONS.info} ${cmd("setprefix reset", ctx.prefix)} → revient au global`
      ]);
    }

    // --- Préfixe GLOBAL (réservé aux administrateurs du bot) -----------------
    if (scope === "global" || scope === "globals" || scope === "--global") {
      if (!permissions.isAdmin(ctx.senderID)) {
        return denied("admin", "Le préfixe global concerne toutes les conversations du bot.");
      }
      const value = String(args[1] || "").trim();
      if (!value || value === "reset") {
        const result = services.settings.setGlobalPrefix("", { by: ctx.senderID });
        return result.ok
          ? box("PRÉFIXE GLOBAL", [`${ICONS.ok} Préfixe global réinitialisé sur « ${config.prefix} ».`])
          : lightBox("PRÉFIXE GLOBAL", [`${ICONS.warn} ${result.error}`]);
      }
      const result = services.settings.setGlobalPrefix(value, { by: ctx.senderID });
      if (!result.ok) return lightBox("PRÉFIXE GLOBAL", [`${ICONS.no} ${result.error}`, "", `${ICONS.pin} 1 à 4 caractères, sans espace.`]);

      bag.logs.info("settings", `Préfixe global changé en « ${result.prefix} »`, { userID: ctx.senderID, command: "setprefix" });
      return box("PRÉFIXE GLOBAL", [
        `${ICONS.ok} Le préfixe global est maintenant « ${result.prefix} ».`,
        "",
        `${ICONS.pin} Les groupes ayant leur propre préfixe ne changent pas.`,
        `${ICONS.info} Exemple : ${cmd("ping", result.prefix)}`
      ]);
    }

    // --- Préfixe du GROUPE courant ------------------------------------------
    if (!ctx.isGroup) {
      return lightBox("PRÉFIXE", [
        `${ICONS.warn} En conversation privée, le préfixe suit le réglage global.`,
        "",
        `${ICONS.pin} ${cmd("setprefix global !", ctx.prefix)} (administrateurs du bot uniquement)`
      ]);
    }

    const value = String(args[0] || "").trim();
    if (value.toLowerCase() === "reset") {
      const result = services.settings.set(ctx.threadID, "prefix", "", { by: ctx.senderID });
      if (!result.ok) return lightBox("PRÉFIXE", [`${ICONS.warn} ${result.error}`]);
      const effective = services.settings.prefixFor(ctx.threadID);
      return box("PRÉFIXE", [`${ICONS.ok} Préfixe du groupe réinitialisé.`, `${ICONS.pin} Effectif maintenant : ${effective}`, "", `${ICONS.info} Exemple : ${cmd("ping", effective)}`]);
    }

    if (/\s/.test(value)) return lightBox("PRÉFIXE", [`${ICONS.no} Le préfixe ne peut pas contenir d'espace.`]);
    if (value.length > 4) return lightBox("PRÉFIXE", [`${ICONS.no} Le préfixe est limité à 4 caractères.`]);

    const result = services.settings.set(ctx.threadID, "prefix", value, { by: ctx.senderID });
    if (!result.ok) return lightBox("PRÉFIXE", [`${ICONS.no} ${result.error}`]);

    bag.logs.info("settings", `Préfixe du groupe ${ctx.threadID} = « ${value} »`, { userID: ctx.senderID, threadID: ctx.threadID, command: "setprefix" });
    return box("PRÉFIXE", [
      `${ICONS.ok} Le préfixe de ce groupe est maintenant « ${value} ».`,
      "",
      `${ICONS.pin} Chaque groupe garde son propre préfixe.`,
      `${ICONS.info} Essaie : ${cmd("ping", value)} • ${cmd("menu", value)}`,
      `${ICONS.info} Retour au global : ${cmd("setprefix reset", value)}`
    ]);
  }
};
