"use strict";

/**
 * /stats — statistiques globales du bot.
 *   /stats            vue d'ensemble
 *   /stats commands   commandes les plus utilisées
 *   /stats errors     erreurs enregistrées
 *   /stats uptime     temps de fonctionnement détaillé
 */

const { box, lightBox, cmd, num, progress, ICONS } = require("../../utils/text");
const { formatDuration } = require("../../utils/helpers");

module.exports = {
  name: "stats",
  aliases: ["statistiques", "statistic", "botstats", "chiffres"],
  category: "stats",
  description: "Statistiques globales du bot : usage, utilisateurs, groupes, erreurs, uptime.",
  usage: "/stats [commands|errors|uptime]",
  examples: ["/stats", "/stats commands", "/stats errors"],
  permissions: "admin",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services, registry, config } = bag;
    const stats = services.stats;
    const summary = stats.summary();
    const section = String(ctx.args[0] || "").trim().toLowerCase();

    if (section === "commands" || section === "commandes") {
      const top = stats.topCommands(12);
      const categories = stats.topCategories(8);
      const max = top.length ? top[0].count : 1;
      return box("COMMANDES LES PLUS UTILISÉES", [
        `${ICONS.bolt} ${num(summary.totalCommands)} exécutions • ${num(summary.uniqueCommands)} commandes distinctes`,
        "",
        ...(top.length ? top.map((entry, index) => `${String(index + 1).padStart(2, " ")}. ${cmd(entry.name, ctx.prefix).padEnd(16, " ")} ${num(entry.count)} ${progress(entry.count, max, 8)}`) : [`${ICONS.info} Aucune commande exécutée pour l'instant.`]),
        "",
        `${ICONS.chart} Catégories :`,
        ...(categories.length ? categories.map((entry) => `   • ${entry.name.padEnd(12, " ")} ${num(entry.count)}`) : ["   • (aucune)"]),
        "",
        `${ICONS.warn} Commandes inconnues tapées : ${num(summary.totalUnknown)}`,
        `${ICONS.info} Détail : ${cmd("topcommands", ctx.prefix)}`
      ]);
    }

    if (section === "errors" || section === "erreurs") {
      const errors = stats.lastErrors(8);
      const unknown = stats.unknownTop(6);
      return box("ERREURS", [
        `${ICONS.error} Total enregistré : ${num(summary.totalErrors)}`,
        "",
        ...(errors.length
          ? errors.map((entry) => `• ${new Date(entry.at).toLocaleString("fr-FR")} [${entry.command || entry.scope || "?"}] ${String(entry.message).slice(0, 70)}`)
          : [`${ICONS.ok} Aucune erreur enregistrée.`]),
        "",
        `${ICONS.warn} Commandes inconnues les plus tapées :`,
        ...(unknown.length ? unknown.map((entry) => `   • ${entry.name} (${num(entry.count)})`) : ["   • (aucune)"]),
        "",
        `${ICONS.info} Journal complet : ${cmd("logs", ctx.prefix)}`
      ]);
    }

    if (section === "uptime" || section === "temps") {
      const memory = process.memoryUsage();
      return box("TEMPS DE FONCTIONNEMENT", [
        `${ICONS.time} Session actuelle : ${formatDuration(summary.uptimeMs)}`,
        `${ICONS.bolt} Démarrée le : ${new Date(summary.startedAt).toLocaleString("fr-FR")}`,
        `${ICONS.chart} Processus Node : ${formatDuration(process.uptime())} • ${num(summary.bootCount)} démarrage(s) enregistré(s)`,
        "",
        `${ICONS.gear} Mémoire : ${num(Math.round(memory.heapUsed / 1048576))} Mo utilisés / ${num(Math.round(memory.heapTotal / 1048576))} Mo alloués`,
        `${ICONS.pin} Résident (RSS) : ${num(Math.round(memory.rss / 1048576))} Mo`,
        `${progress(Math.round(memory.heapUsed / 1048576), Math.max(64, Math.round(memory.heapTotal / 1048576)))}`,
        "",
        `${ICONS.info} Version ${config.identity.version} • Node ${process.version} • ${config._meta.env}`
      ]);
    }

    if (section && !["commands", "commandes", "errors", "erreurs", "uptime", "temps"].includes(section)) {
      return lightBox("STATISTIQUES", [`${ICONS.warn} Section inconnue : « ${section.slice(0, 20)} ».`, "", `${ICONS.pin} Sections : commands, errors, uptime`]);
    }

    const moderation = services.warnings.stats();
    const readiness = services.external.readiness();
    return box("STATISTIQUES GLOBALES", [
      `${ICONS.robot} ${config.identity.name} v${config.identity.version}`,
      `${ICONS.time} Uptime : ${formatDuration(summary.uptimeMs)} • ${num(summary.bootCount)} démarrage(s)`,
      "",
      `${ICONS.chart} Messages traités : ${num(summary.totalMessages)}`,
      `${ICONS.bolt} Commandes exécutées : ${num(summary.totalCommands)} (${num(summary.uniqueCommands)} distinctes)`,
      `${ICONS.warn} Commandes inconnues : ${num(summary.totalUnknown)}`,
      `💬 Réponses conversationnelles : ${num(summary.conversationReplies)} • Mentions : ${num(summary.mentionReplies)}`,
      `${ICONS.no} Actions de modération : ${num(summary.moderationActions)} (${num(moderation.bans)} ban • ${num(moderation.warns)} warn)`,
      `${ICONS.error} Erreurs : ${num(summary.totalErrors)}`,
      "",
      `${ICONS.user} Utilisateurs : ${num(services.users.count())} connus • ${num(summary.trackedUsers)} actifs`,
      `${ICONS.group} Conversations : ${num(services.groups.count())} dont ${num(services.groups.groupCount())} groupe(s)`,
      `${ICONS.book} Commandes chargées : ${num(registry.count())} • ${num(registry.categories().length)} catégories`,
      `${ICONS.plug} Services externes : ${num(readiness.ready)}/${num(readiness.total)} disponibles`,
      "",
      `${ICONS.info} ${cmd("stats commands", ctx.prefix)} • ${cmd("stats errors", ctx.prefix)} • ${cmd("stats uptime", ctx.prefix)}`
    ]);
  }
};
