"use strict";

/**
 * /config — lecture de la configuration RÉELLE du bot (config.json + variables
 * d'environnement). Aucun secret n'est affiché : clés et jetons sont masqués.
 *
 *   /config              vue d'ensemble
 *   /config bot          identité, préfixe, propriétaire
 *   /config economy      devise, daily/work/crime, transferts
 *   /config xp           gains et formule de niveau
 *   /config moderation   avertissements, anti-lien, listes blanches
 *   /config limits       cooldowns, anti-flood, tailles
 *   /config storage      persistance + snapshot distant
 *   /config services     état des services externes et clés (masquées)
 *   /config behaviour    conversation naturelle + récompenses de jeux
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { formatDuration } = require("../../utils/helpers");

const SECTIONS = ["bot", "economy", "économie", "xp", "moderation", "modération", "limits", "limites", "storage", "data", "services", "behaviour", "comportement"];

/** Masque un secret sans jamais l'afficher en clair. */
function masked(value) {
  const text = String(value || "").trim();
  if (!text) return "⚪ non défini";
  if (text.length <= 6) return "🔒 ••••••";
  return `🔒 ${text.slice(0, 3)}…${text.slice(-2)}`;
}

module.exports = {
  name: "config",
  aliases: ["configuration", "conf", "showconfig"],
  category: "config",
  description: "Affiche la configuration effective du bot (secrets masqués).",
  usage: "/config [bot|economy|xp|moderation|limits|storage|services|behaviour]",
  examples: ["/config", "/config limits", "/config services"],
  permissions: "admin",
  cooldown: 15,

  async execute(ctx, bag) {
    const { services, config, registry } = bag;
    const section = String(ctx.args[0] || "").trim().toLowerCase();

    if (section === "bot") {
      const global = services.settings.globalOverrides();
      return box("CONFIGURATION — BOT", [
        `${ICONS.robot} Nom : ${config.identity.name} v${config.identity.version}`,
        `${ICONS.pin} Préfixe global : ${global.prefix || config.prefix}${global.prefix ? " (changé par /setprefix global)" : " (config.json / PREFIX)"}`,
        `🌍 Langue par défaut : ${config.language}`,
        `${ICONS.crown} Propriétaire : ${config.owner.uid}`,
        `${ICONS.gear} Environnement : ${config._meta.env} • Node ${process.version}`,
        `${ICONS.book} ${num(registry.count())} commandes • ${num(registry.categories().length)} catégories`,
        `${ICONS.lock} /eval : ${config.security.allowEval ? "⚠️ activé" : "désactivé"}`
      ]);
    }

    if (section === "economy" || section === "économie") {
      const eco = config.economy;
      return box("CONFIGURATION — ÉCONOMIE", [
        `${ICONS.money} Devise : ${config.currency.name} (${config.currency.symbol})`,
        `${ICONS.pin} Solde de départ : ${num(config.currency.startBalance)} ${config.currency.symbol} • plafond ${num(config.currency.maxBalance)}`,
        `${ICONS.time} Daily : ${num(eco.daily.min)}–${num(eco.daily.max)} ${config.currency.symbol} toutes les ${num(eco.daily.cooldownHours)} h`,
        `${ICONS.tool} Work : ${num(eco.work.min)}–${num(eco.work.max)} ${config.currency.symbol} toutes les ${num(eco.work.cooldownMinutes)} min`,
        `${ICONS.fire} Crime : ${num(eco.crime.min)}–${num(eco.crime.max)} ${config.currency.symbol} • succès ${Math.round(eco.crime.successRate * 100)} % • amende ${num(eco.crime.fineMin)}–${num(eco.crime.fineMax)} • cooldown ${num(eco.crime.cooldownMinutes)} min`,
        `${ICONS.chart} Taxe de transfert : ${num(eco.transferFeePercent)} %`,
        `${ICONS.gear} Emplacements d'inventaire : ${num(config.limits.maxInventorySlots)}`
      ]);
    }

    if (section === "xp") {
      const xp = config.xp;
      return box("CONFIGURATION — XP", [
        `${ICONS.xp} XP par message : ${num(xp.perMessage)} (une fois toutes les ${formatDuration(xp.messageIntervalMs)})`,
        `${ICONS.bolt} XP par commande : ${num(xp.perCommand)}`,
        `${ICONS.game} XP par partie : victoire ${num(config.games.xpReward.win)} • nul ${num(config.games.xpReward.draw)} • défaite ${num(config.games.xpReward.lose)}`,
        `${ICONS.level} Formule : base ${num(xp.base)} × facteur ${xp.factor} par niveau`,
        `${ICONS.chart} Niveau maximum : ${num(xp.maxLevel)}`,
        "",
        `${ICONS.info} Les niveaux sont calculés à partir de l'XP totale (services/xp.js).`
      ]);
    }

    if (section === "moderation" || section === "modération") {
      const mod = config.moderation;
      return box("CONFIGURATION — MODÉRATION", [
        `${ICONS.warn} Avertissements avant sanction : ${num(config.limits.maxWarns)} → mute de ${num(services.warnings.autoMuteMinutes())} min`,
        `🔗 Anti-lien par défaut : ${mod.antilinkDefault ? "activé" : "désactivé"}`,
        `🛡️ Anti-spam par défaut : ${mod.antispamDefault ? "activé" : "désactivé"}`,
        `👋 Bienvenue par défaut : ${mod.welcomeDefault ? "activée" : "désactivée"}`,
        `🚪 Au revoir par défaut : ${mod.goodbyeDefault ? "activée" : "désactivée"}`,
        "",
        `${ICONS.pin} Domaines autorisés (global) : ${mod.allowedLinkDomains.join(", ") || "aucun"}`,
        `${ICONS.info} Chaque groupe ajoute les siens : ${cmd("antilink allow exemple.com", ctx.prefix)}`,
        `${ICONS.lock} Le propriétaire et les admins du bot ne peuvent jamais être sanctionnés.`
      ]);
    }

    if (section === "limits" || section === "limites") {
      const limits = config.limits;
      return box("CONFIGURATION — LIMITES", [
        `${ICONS.time} Cooldown par défaut : ${formatDuration(limits.defaultCooldownSeconds * 1000)}`,
        `${ICONS.bolt} Cooldown global entre commandes : ${formatDuration(limits.globalCooldownMs)}`,
        `🛑 Anti-flood : ${num(limits.floodMessages)} messages / ${formatDuration(limits.floodWindowMs)} → pause ${formatDuration(limits.floodMuteMs)}`,
        `${ICONS.chart} Message maximum : ${num(limits.maxMessageLength)} caractères (découpé au-delà)`,
        `${ICONS.gear} Fenêtre anti-doublon : ${formatDuration(limits.dedupeTtlMs)}`,
        `${ICONS.book} Journal conservé : ${num(config.security.logRetention)} entrées`,
        `${ICONS.user} Inventaire : ${num(limits.maxInventorySlots)} emplacements`
      ]);
    }

    if (section === "storage" || section === "data") {
      const storeStats = services.store.stats();
      const storage = config.storage;
      return box("CONFIGURATION — DONNÉES", [
        `${ICONS.pin} Dossier : ${storeStats.dir}`,
        `${ICONS.gear} Sauvegarde différée : toutes les ${formatDuration(storage.flushIntervalMs)}`,
        `☁️ Snapshot distant : ${storeStats.remoteEnabled ? `✅ toutes les ${formatDuration(storage.snapshotIntervalMs)} vers ${masked(storage.remote.url)}` : "⚪ non configuré"}`,
        `${ICONS.lock} Jeton du snapshot : ${masked(storage.remote.token)}`,
        `${ICONS.info} Variables : REMOTE_STORE_URL, REMOTE_STORE_TOKEN, REMOTE_STORE_HEADER`,
        "",
        `${ICONS.warn} Sur Render le disque est éphémère : sans snapshot distant, les données repartent de zéro à chaque déploiement.`,
        "",
        ...Object.entries(storeStats.collections).map(([name, entry]) => `• ${String(name).padEnd(11, " ")} ${num(entry.entries)} entrée(s) • ${num(entry.writes)} écriture(s)`)
      ]);
    }

    if (section === "services") {
      const list = services.external.status();
      const icons = { public: "🟢", configured: "🔵", missing: "🟠" };
      return box("CONFIGURATION — SERVICES", [
        ...list.map((service) => `${icons[service.kind] || "⚪"} ${String(service.name).padEnd(13, " ")} ${service.detail}`),
        "",
        `${ICONS.robot} IA : fournisseur ${config.ai.provider || "aucun"} • modèle ${config.ai.model || "par défaut"} • clé ${masked(config.ai.apiKey)}`,
        `🖼️ Images : clé ${masked(config.ai.imageApiKey)} • max ${num(config.ai.maxTokens)} jetons`,
        `${ICONS.media} Média : ${masked(config.media.apiUrl)} • jeton ${masked(config.media.apiToken)}`,
        `🔎 YouTube : clé ${masked(config.media.youtubeApiKey)}`,
        "",
        `${ICONS.info} Les services publics (météo, traduction, QR, paroles…) fonctionnent sans clé.`,
        `${ICONS.lock} Aucune clé n'est affichée en clair, ici comme dans les journaux.`
      ]);
    }

    if (section === "behaviour" || section === "comportement") {
      const conv = config.conversation;
      return box("CONFIGURATION — COMPORTEMENT", [
        `💬 Conversation naturelle : ${conv.enabled ? "activée" : "désactivée"}`,
        `${ICONS.chart} Probabilité de réponse : ${Math.round(conv.probability * 100)} % en privé • ${Math.round(conv.groupProbability * 100)} % en groupe`,
        `${ICONS.time} Pause par conversation : ${formatDuration(conv.threadCooldownMs)} • par utilisateur : ${formatDuration(conv.userCooldownMs)}`,
        `${ICONS.pin} Mention du bot : ${conv.mentionAlwaysReplies ? "réponse systématique" : "réponse probable"}`,
        `${ICONS.gear} Longueur minimale ignorée : ${num(conv.minTextLength)} caractère(s) • bots ignorés : ${conv.ignoreBots ? "oui" : "non"}`,
        "",
        `${ICONS.game} Récompenses de jeux : ${num(config.games.coinReward.win)} / ${num(config.games.coinReward.draw)} / ${num(config.games.coinReward.lose)} ${config.currency.symbol} (victoire / nul / défaite)`,
        `${ICONS.time} Session de jeu expirée après : ${formatDuration(config.games.sessionTimeoutMs)}`,
        "",
        `${ICONS.info} Le bot ne répond jamais à ses propres messages (anti-boucle).`
      ]);
    }

    if (section && !SECTIONS.includes(section)) {
      return lightBox("CONFIGURATION", [
        `${ICONS.warn} Section inconnue : « ${section.slice(0, 20)} ».`,
        "",
        `${ICONS.pin} Sections : bot, economy, xp, moderation, limits, storage, services, behaviour`
      ]);
    }

    const readiness = services.external.readiness();
    const status = services.settings.status();
    const global = services.settings.globalOverrides();
    return box("CONFIGURATION", [
      `${ICONS.robot} ${config.identity.name} v${config.identity.version} • ${config._meta.env}`,
      `${status.icon} Mode : ${status.label}`,
      `${ICONS.pin} Préfixe global : ${global.prefix || config.prefix} • ici : ${ctx.prefix}`,
      `${ICONS.crown} Propriétaire : ${config.owner.uid} • ${num(services.users.admins().length)} admin(s) déclaré(s)`,
      `${ICONS.money} Devise : ${config.currency.name} (${config.currency.symbol})`,
      `${ICONS.book} ${num(registry.count())} commandes • ${num(registry.categories().length)} catégories`,
      `${ICONS.plug} Services : ${num(readiness.ready)}/${num(readiness.total)} disponibles${readiness.missing.length ? ` • à configurer : ${readiness.missing.join(", ")}` : ""}`,
      `${ICONS.gear} Groupes réglés : ${num(services.settings.count())} • Profils : ${num(services.users.count())} • Groupes : ${num(services.groups.groupCount())}`,
      `☁️ Snapshot distant : ${remoteState(config)}`,
      "",
      `${ICONS.info} Sections détaillées :`,
      `   ${cmd("config bot", ctx.prefix)} • ${cmd("config economy", ctx.prefix)} • ${cmd("config xp", ctx.prefix)}`,
      `   ${cmd("config moderation", ctx.prefix)} • ${cmd("config limits", ctx.prefix)}`,
      `   ${cmd("config storage", ctx.prefix)} • ${cmd("config services", ctx.prefix)} • ${cmd("config behaviour", ctx.prefix)}`,
      "",
      `${ICONS.lock} Secrets masqués partout (clés, jetons, cookies, account.txt).`
    ]);
  }
};

/** État du snapshot distant, sans exposer l'URL complète. */
function remoteState(config) {
  const url = String((config.storage && config.storage.remote && config.storage.remote.url) || "").trim();
  return url ? "✅ configuré" : "⚪ non configuré (disque local)";
}
