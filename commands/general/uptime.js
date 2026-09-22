"use strict";

/**
 * /uptime — durée de fonctionnement et disponibilité.
 */

const { box, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "uptime",
  aliases: ["online", "dispo"],
  category: "general",
  description: "Affiche depuis combien de temps le bot est en ligne.",
  usage: "/uptime",
  examples: ["/uptime"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services } = bag;
    const stats = services.stats.summary();
    const started = new Date(stats.startedAt || Date.now());
    const memory = process.memoryUsage();

    return box(
      "UPTIME",
      [
        `${ICONS.ok} En ligne depuis ${bag.helpers.formatDuration(stats.uptimeMs)}`,
        `${ICONS.time} Démarré le ${started.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}`,
        "",
        `${ICONS.chart} ${num(stats.totalMessages)} messages traités`,
        `${ICONS.bolt} ${num(stats.totalCommands)} commandes exécutées`,
        `${ICONS.warn} ${num(stats.totalErrors)} erreur(s) technique(s)`,
        `${ICONS.gear} Redémarrages : ${num(stats.bootCount)}`,
        "",
        `${ICONS.info} Mémoire : ${num(Math.round(memory.heapUsed / 1024 / 1024))}/${num(Math.round(memory.rss / 1024 / 1024))} Mo`
      ]
    );
  }
};
