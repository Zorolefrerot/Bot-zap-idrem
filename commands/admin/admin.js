"use strict";

/**
 * /admin — tableau de bord du bot.
 *   /admin            vue d'ensemble
 *   /admin status     état des services externes
 *   /admin users      utilisateurs les plus actifs
 *   /admin groups     groupes les plus actifs
 *   /admin errors     dernières erreurs techniques
 *   /admin data       état de la persistance
 *   /admin mods       historique de modération
 */

const { box, lightBox, cmd, num, progress, ICONS } = require("../../utils/text");
const { formatDuration } = require("../../utils/helpers");

const SECTIONS = ["status", "services", "users", "utilisateurs", "groups", "groupes", "errors", "erreurs", "data", "donnees", "données", "mods", "moderation"];

module.exports = {
  name: "admin",
  aliases: ["dashboard", "panel", "console"],
  category: "admin",
  description: "Tableau de bord : état du bot, services, données, erreurs et modération.",
  usage: "/admin [status|users|groups|errors|data|mods]",
  examples: ["/admin", "/admin status", "/admin errors"],
  permissions: "admin",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services, config, registry, permissions } = bag;
    const stats = services.stats;
    const summary = stats.summary();
    const section = String(ctx.args[0] || "").trim().toLowerCase();

    // --- Services externes --------------------------------------------------
    if (section === "status" || section === "services") {
      const icons = { public: "🟢", configured: "🔵", missing: "🟠" };
      const list = services.external.status();
      const readiness = services.external.readiness();
      const status = services.settings.status();
      return box("SERVICES", [
        ...list.map((service) => `${icons[service.kind] || "⚪"} ${String(service.name).padEnd(13, " ")} ${service.detail}`),
        "",
        `${ICONS.chart} ${num(readiness.ready)}/${num(readiness.total)} services disponibles`,
        readiness.missing.length
          ? `${ICONS.warn} À configurer : ${readiness.missing.join(", ")}`
          : `${ICONS.ok} Tout est branché.`,
        "",
        `${ICONS.robot} Mode du bot : ${status.icon} ${status.label}`
      ]);
    }

    // --- Utilisateurs -------------------------------------------------------
    if (section === "users" || section === "utilisateurs") {
      const top = stats.topUsers(8);
      const lines = [`${ICONS.user} Profils enregistrés : ${num(services.users.count())}`, `${ICONS.chart} Suivis en activité : ${num(summary.trackedUsers)}`];
      if (!top.length) lines.push("", `${ICONS.info} Aucune activité enregistrée pour l'instant.`);
      else {
        lines.push("", `${ICONS.pin} Les plus actifs :`, ...top.map((entry, index) => `${index + 1}. ${String(services.users.getName(entry.userID) || entry.userID).slice(0, 24)} — ${num(entry.count)} msg`));
      }
      return box("UTILISATEURS", lines);
    }

    // --- Groupes ------------------------------------------------------------
    if (section === "groups" || section === "groupes") {
      const top = stats.topThreads(8);
      const lines = [`${ICONS.group} Groupes suivis : ${num(services.groups.groupCount())}`, `${ICONS.chart} Conversations actives : ${num(summary.trackedThreads)}`];
      if (!top.length) lines.push("", `${ICONS.info} Aucune activité de groupe enregistrée.`);
      else {
        lines.push("", `${ICONS.pin} Les plus actifs :`, ...top.map((entry, index) => {
          const record = services.groups.get(entry.threadID);
          const name = (record && record.name) || `conversation ${entry.threadID}`;
          return `${index + 1}. ${String(name).slice(0, 26)} — ${num(entry.count)} msg`;
        }));
      }
      return box("GROUPES", lines);
    }

    // --- Erreurs ------------------------------------------------------------
    if (section === "errors" || section === "erreurs") {
      const errors = stats.lastErrors(6);
      const lines = [`${ICONS.error} Erreurs enregistrées : ${num(summary.totalErrors)}`, `${ICONS.warn} Commandes inconnues : ${num(summary.totalUnknown)}`];
      if (!errors.length) lines.push("", `${ICONS.ok} Aucune erreur récente.`);
      else lines.push("", ...errors.map((entry) => `• [${entry.command || entry.scope || "?"}] ${String(entry.message).slice(0, 90)}`));
      lines.push("", `${ICONS.info} Journal complet : ${cmd("logs", ctx.prefix)}.`);
      return box("ERREURS", lines);
    }

    // --- Persistance --------------------------------------------------------
    if (section === "data" || section === "donnees" || section === "données") {
      const storeStats = services.store.stats();
      return box("PERSISTANCE", [
        `${ICONS.pin} Dossier : ${storeStats.dir}`,
        `${ICONS.gear} Snapshot distant : ${storeStats.remoteEnabled ? "✅ activé" : "⚪ non configuré (disque local uniquement)"}`,
        "",
        `${ICONS.book} Collections :`,
        ...Object.entries(storeStats.collections).map(
          ([name, entry]) => `• ${String(name).padEnd(11, " ")} ${num(entry.entries)} entrée(s) • ${num(entry.writes)} écriture(s)${entry.errors ? ` • ⚠️ ${num(entry.errors)} échec(s)` : ""}`
        ),
        "",
        `${ICONS.info} Écritures atomiques + sauvegarde différée : pas de JSON corrompu en cas d'arrêt brutal.`,
        `${ICONS.warn} Sur Render le disque est éphémère : branche REMOTE_STORE_URL pour conserver les données.`
      ]);
    }

    // --- Modération ---------------------------------------------------------
    if (section === "mods" || section === "moderation") {
      const moderation = services.warnings.stats();
      const kicks = services.warnings.kicks(5);
      const lines = [
        `${ICONS.no} Bannissements actifs : ${num(moderation.bans)}`,
        `${ICONS.warn} Avertissements cumulés : ${num(moderation.warns)}`,
        `🔇 Muet enregistrés : ${num(moderation.mutes)}`,
        `${ICONS.group} Expulsions : ${num(moderation.kicks)}`,
        `${ICONS.chart} Actions de modération : ${num(summary.moderationActions)}`
      ];
      if (kicks.length) lines.push("", `${ICONS.pin} Dernières expulsions :`, ...kicks.map((kick) => `• ${kick.userID} (groupe ${kick.threadID})${kick.reason ? ` — ${kick.reason.slice(0, 30)}` : ""}`));
      else lines.push("", `${ICONS.ok} Aucune expulsion enregistrée.`);
      return box("MODÉRATION", lines);
    }

    if (section && !SECTIONS.includes(section)) {
      return lightBox("ADMIN", [
        `${ICONS.warn} Section inconnue : « ${section.slice(0, 20)} ».`,
        "",
        `${ICONS.pin} Sections disponibles : status, users, groups, errors, data, mods`
      ]);
    }

    // --- Vue d'ensemble -----------------------------------------------------
    const status = services.settings.status();
    const moderation = services.warnings.stats();
    const readiness = services.external.readiness();
    const owner = permissions.getOwnerUID();
    const admins = permissions.getAdminUIDs();
    const memory = process.memoryUsage();

    return box("TABLEAU DE BORD", [
      `${ICONS.robot} ${config.identity.name} v${config.identity.version}`,
      `${status.icon} Mode : ${status.label}${status.text ? ` — ${status.text}` : ""}`,
      `${ICONS.time} Uptime : ${formatDuration(summary.uptimeMs)} • démarré ${new Date(summary.startedAt).toLocaleString("fr-FR")}`,
      `${ICONS.bolt} Redémarrages : ${num(summary.bootCount)}`,
      "",
      `${ICONS.user} Utilisateurs : ${num(services.users.count())}   ${ICONS.group} Groupes : ${num(services.groups.groupCount())}`,
      `${ICONS.chart} Messages : ${num(summary.totalMessages)}   Commandes : ${num(summary.totalCommands)}`,
      `${ICONS.book} Commandes chargées : ${num(registry.count())} • ${num(registry.categories().length)} catégories`,
      `${ICONS.error} Erreurs : ${num(summary.totalErrors)}   Inconnues : ${num(summary.totalUnknown)}`,
      `${ICONS.no} Modération : ${num(moderation.bans)} ban • ${num(moderation.warns)} warn • ${num(moderation.kicks)} kick`,
      `${ICONS.plug} Services : ${num(readiness.ready)}/${num(readiness.total)} disponibles`,
      "",
      `${ICONS.crown} Propriétaire : ${owner || "non configuré"} • Admins : ${num(admins.length)}`,
      `${ICONS.pin} Préfixe ici : ${ctx.prefix} • Langue : ${config.language} • ${config._meta.env}`,
      `${ICONS.gear} Mémoire : ${progress(Math.round(memory.heapUsed / 1048576), Math.max(64, Math.round(memory.heapTotal / 1048576)))} ${num(Math.round(memory.heapUsed / 1048576))} Mo`,
      "",
      `${ICONS.info} ${cmd("admin status", ctx.prefix)} • ${cmd("admin users", ctx.prefix)} • ${cmd("admin groups", ctx.prefix)}`,
      `${ICONS.info} ${cmd("admin errors", ctx.prefix)} • ${cmd("admin data", ctx.prefix)} • ${cmd("admin mods", ctx.prefix)}`
    ]);
  }
};
