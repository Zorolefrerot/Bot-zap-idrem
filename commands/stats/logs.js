"use strict";

/**
 * /logs — journal interne du bot (persisté, sans donnée sensible).
 *   /logs                   → 15 dernières entrées
 *   /logs 30                → 30 dernières
 *   /logs error             → niveau « error » uniquement
 *   /logs warn 20           → niveau + quantité
 *   /logs scope moderation  → filtre par périmètre
 *   /logs search <mot>      → recherche plein texte
 *   /logs stats             → compteurs par niveau
 *   /logs clear --force     → vide le journal (propriétaire)
 *
 * Les messages sont nettoyés par utils/logger.sanitize() à l'écriture : aucun
 * cookie, jeton ou identifiant de session ne peut apparaître ici.
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

const LEVELS = ["debug", "info", "warn", "error"];
const MAX_LINES = 30;

module.exports = {
  name: "logs",
  aliases: ["journal", "log", "historique", "logbot"],
  category: "stats",
  description: "Consulte le journal interne du bot (niveaux, périmètres, recherche).",
  usage: "/logs [nombre|error|warn|info|debug|scope <nom>|search <mot>|stats|clear --force]",
  examples: ["/logs", "/logs error", "/logs 25", "/logs search ban", "/logs stats"],
  permissions: "admin",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services, permissions, config } = bag;
    const logs = services.logs;
    const args = ctx.args.map((a) => String(a).trim());
    const first = args[0] ? args[0].toLowerCase() : "";

    // --- Compteurs ------------------------------------------------------------
    if (first === "stats" || first === "count") {
      return box("JOURNAL — COMPTEURS", [
        ...LEVELS.map((level) => `${logs.LEVEL_ICONS[level]} ${level.padEnd(6, " ")} ${num(logs.count(level))} entrée(s)`),
        "",
        `${ICONS.pin} Total : ${num(logs.count())} entrée(s)`,
        `${ICONS.gear} Conservation : ${num(config.security.logRetention)} entrées (les plus anciennes sont supprimées)`,
        `${ICONS.lock} Chaque message est nettoyé des données sensibles avant stockage.`
      ]);
    }

    // --- Vidage ---------------------------------------------------------------
    if (first === "clear" || first === "vide" || first === "vider") {
      if (!permissions.isOwner(ctx.senderID)) return bag.text.denied("owner", "Seul le propriétaire peut vider le journal.");
      if (!args.some((arg) => arg.toLowerCase() === "--force")) {
        return lightBox("JOURNAL", [
          `${ICONS.warn} ${num(logs.count())} entrée(s) seraient définitivement supprimées.`,
          "",
          `${ICONS.pin} Confirme avec : ${cmd("logs clear --force", ctx.prefix)}`
        ]);
      }
      const removed = logs.count();
      logs.clear();
      logs.warn("admin", `Journal vidé (${removed} entrées) par le propriétaire.`, { userID: ctx.senderID, command: "logs" });
      return box("JOURNAL VIDÉ", [`${ICONS.ok} ${num(removed)} entrée(s) supprimée(s).`, "", `${ICONS.info} Le bot continue de journaliser normalement.`]);
    }

    // --- Filtres --------------------------------------------------------------
    const options = { limit: 15 };
    const filters = [];

    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      const lower = value.toLowerCase();

      if (LEVELS.includes(lower)) {
        options.level = lower;
        filters.push(`niveau ${lower}`);
        continue;
      }
      if (/^\d{1,3}$/.test(value)) {
        options.limit = Math.min(MAX_LINES, Math.max(1, Number(value)));
        filters.push(`${options.limit} dernières`);
        continue;
      }
      if (lower === "scope" || lower === "perimetre" || lower === "périmètre") {
        const scope = args[index + 1];
        if (scope) {
          options.scope = scope.toLowerCase();
          filters.push(`périmètre « ${scope} »`);
          index += 1;
        }
        continue;
      }
      if (lower === "search" || lower === "recherche") {
        const needle = args.slice(index + 1).join(" ");
        if (needle.trim()) {
          options.search = needle.trim();
          filters.push(`contenant « ${needle.trim().slice(0, 20)} »`);
        }
        break;
      }
    }

    const entries = logs.list(options);
    const title = filters.length ? `JOURNAL — ${filters.join(" • ").slice(0, 40).toUpperCase()}` : "JOURNAL DU BOT";

    if (!entries.length) {
      return lightBox(title, [
        `${ICONS.info} Aucune entrée ne correspond à ces critères.`,
        "",
        `${ICONS.pin} ${cmd("logs", ctx.prefix)} • ${cmd("logs error", ctx.prefix)} • ${cmd("logs stats", ctx.prefix)}`,
        `${ICONS.info} Le journal conserve ${num(config.security.logRetention)} entrées maximum.`
      ]);
    }

    return box(title, [
      `${ICONS.chart} ${num(entries.length)} entrée(s) affichée(s) sur ${num(logs.count())} • les plus récentes d'abord`,
      "",
      ...entries.map((entry) => {
        const icon = logs.LEVEL_ICONS[entry.level] || "•";
        const scope = entry.scope ? `[${entry.scope}]` : "";
        const meta = [entry.command ? `/${entry.command}` : "", entry.threadID ? `groupe ${entry.threadID.slice(-5)}` : ""].filter(Boolean).join(" ");
        return `${icon} ${logs.formatTime(entry.at)} ${scope} ${String(entry.message).slice(0, 110)}${meta ? ` — ${meta}` : ""}`;
      }),
      "",
      `${ICONS.lock} Aucun cookie, jeton ni identifiant de session n'est journalisé.`,
      `${ICONS.info} ${cmd("logs stats", ctx.prefix)} • ${cmd("logs search <mot>", ctx.prefix)} • ${cmd("logs scope moderation", ctx.prefix)}`
    ]);
  }
};
