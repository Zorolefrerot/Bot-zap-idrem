"use strict";

/**
 * /shutdown — arrêt propre du bot (sauvegarde puis sortie 0).
 *
 * Sur Render, un arrêt « propre » peut être relancé par la politique de
 * redémarrage du service : pour un arrêt définitif, stoppe le service depuis
 * le tableau de bord. Le message le rappelle explicitement.
 */

const { box, ICONS } = require("../../utils/text");

module.exports = {
  name: "shutdown",
  aliases: ["stop", "eteindre", "éteindre", "poweroff", "off"],
  category: "admin",
  description: "Sauvegarde les données et arrête le bot (arrêt propre).",
  usage: "/shutdown",
  examples: ["/shutdown"],
  permissions: "owner",
  cooldown: 60,

  async execute(ctx, bag) {
    const { logger, config } = bag;

    const confirm = String(ctx.args[0] || "").trim().toLowerCase();
    if (confirm !== "--force" && confirm !== "oui" && confirm !== "confirm") {
      return box("ARRÊT DU BOT", [
        `${ICONS.warn} Cette commande éteint ${config.identity.name}.`,
        "",
        `${ICONS.pin} Confirme avec : /shutdown --force`,
        `${ICONS.info} Un redémarrage complet se fait avec /restart.`
      ]);
    }

    bag.logs.warn("admin", "Arrêt demandé par le propriétaire.", { userID: ctx.senderID, threadID: ctx.threadID, command: "shutdown" });

    let flushed = true;
    try {
      await bag.store.flushAll();
      bag.store.stopTimers();
    } catch (err) {
      flushed = false;
      logger.error(`Sauvegarde avant arrêt incomplète : ${err.message}`, "admin");
    }

    await ctx.send(
      box("EXTINCTION", [
        `⏻ ${config.identity.name} s'arrête maintenant.`,
        `${flushed ? ICONS.ok : ICONS.warn} Données : ${flushed ? "sauvegardées" : "sauvegarde partielle (voir journaux)"}`,
        "",
        `${ICONS.warn} Sur Render, le service peut relancer automatiquement le processus.`,
        `${ICONS.info} Arrêt définitif : bouton « Stop » dans le tableau de bord Render.`
      ])
    );

    setTimeout(async () => {
      try {
        if (bag.bot && typeof bag.bot.stop === "function") await bag.bot.stop();
      } catch (err) {
        logger.warn(`Arrêt du bot : ${err.message}`, "admin");
      }
      logger.warn("Extinction du processus (code 0).", "lifecycle");
      process.exit(0);
    }, 1800).unref?.();

    return "";
  }
};
