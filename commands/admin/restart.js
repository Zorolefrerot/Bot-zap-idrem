"use strict";

/**
 * /restart — redémarrage propre du processus.
 *
 * Séquence : sauvegarde des données → arrêt de l'écoute → sortie avec le code 3.
 * Sur Render, un code de sortie non nul déclenche le redémarrage automatique du
 * service (politique par défaut). Aucune donnée n'est perdue.
 */

const { box, ICONS } = require("../../utils/text");

const RESTART_EXIT_CODE = 3;

module.exports = {
  name: "restart",
  aliases: ["reboot", "redemarrer", "redémarrer"],
  category: "admin",
  description: "Sauvegarde les données puis redémarre le processus du bot.",
  usage: "/restart",
  examples: ["/restart"],
  permissions: "owner",
  cooldown: 60,

  async execute(ctx, bag) {
    const { logger, config } = bag;

    bag.logs.warn("admin", "Redémarrage demandé par le propriétaire.", { userID: ctx.senderID, threadID: ctx.threadID, command: "restart" });

    // 1. Sauvegarde immédiate (aucune donnée en attente ne doit être perdue).
    let flushed = true;
    try {
      await bag.store.flushAll();
      bag.store.stopTimers();
    } catch (err) {
      flushed = false;
      logger.error(`Sauvegarde avant redémarrage incomplète : ${err.message}`, "admin");
    }

    // 2. Confirmation à l'auteur AVANT la sortie.
    await ctx.send(
      box("REDÉMARRAGE", [
        `${ICONS.bolt} Redémarrage du bot dans quelques secondes…`,
        `${flushed ? ICONS.ok : ICONS.warn} Données : ${flushed ? "sauvegardées" : "sauvegarde partielle (voir journaux)"}`,
        "",
        `${ICONS.info} ${config.identity.name} v${config.identity.version} • ${config._meta.env}`,
        `${ICONS.warn} Sur Render, le service relance automatiquement le processus (code de sortie ${RESTART_EXIT_CODE}).`,
        `${ICONS.info} Si rien ne se passe, relance depuis le tableau de bord Render.`
      ])
    );

    // 3. Arrêt de l'écoute puis sortie.
    setTimeout(async () => {
      try {
        if (bag.bot && typeof bag.bot.stop === "function") await bag.bot.stop();
      } catch (err) {
        logger.warn(`Arrêt du bot avant redémarrage : ${err.message}`, "admin");
      }
      logger.warn("Redémarrage du processus (code 3).", "lifecycle");
      process.exit(RESTART_EXIT_CODE);
    }, 1800).unref?.();

    return "";
  }
};
