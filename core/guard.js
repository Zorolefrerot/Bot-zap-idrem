"use strict";

/**
 * core/guard.js
 * ---------------------------------------------------------------------------
 * Barrières de sécurité appliquées AVANT l'exécution d'une commande :
 *
 *   1. bannissement global      → message ignoré (un seul avertissement)
 *   2. mute de conversation     → message ignoré
 *   3. anti-flood               → trop de messages en peu de temps = pause
 *   4. cooldown global          → délai minimal entre deux commandes
 *   5. cooldown par commande    → propre à chaque commande
 *   6. permissions              → public / groupadmin / admin / owner
 *   7. restrictions de contexte → commandes réservées aux groupes
 *
 * Toutes ces vérifications renvoient un objet `{ ok, message? }` : le
 * dispatcher décide quoi envoyer. Rien n'est jamais levé comme exception.
 * ---------------------------------------------------------------------------
 */

const { formatDuration } = require("../utils/helpers");
const i18n = require("../utils/i18n");

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} [deps.logger]
 * @param {object} [deps.permissions]
 * @param {object} [deps.warnings]
 * @param {object} [deps.stats]
 *
 * Les messages du garde passent par utils/i18n.js : la langue de chaque
 * conversation (settings.language) est transmise à chaque vérification.
 */
function createGuard(deps = {}) {
  const { config } = deps;
  const logger = deps.logger || noopLogger;
  const permissions = deps.permissions || null;
  const warnings = deps.warnings || null;
  const stats = deps.stats || null;

  /** @type {Map<string, number>} userID → prochain droit d'exécution (global) */
  const globalCooldown = new Map();
  /** @type {Map<string, number>} `${userID}:${command}` → fin du cooldown */
  const commandCooldown = new Map();
  /** @type {Map<string, number[]>} userID → horodatages récents */
  const floodHits = new Map();
  /** @type {Map<string, number>} userID → fin de la pause anti-flood */
  const floodMuted = new Map();
  /** @type {Set<string>} utilisateurs déjà prévenus (banni/mute/flood) */
  const notified = new Set();

  let lastSweep = Date.now();

  function sweep(now = Date.now()) {
    if (now - lastSweep < 30000) return;
    lastSweep = now;
    for (const [key, expiry] of globalCooldown) if (expiry <= now) globalCooldown.delete(key);
    for (const [key, expiry] of commandCooldown) if (expiry <= now) commandCooldown.delete(key);
    for (const [key, expiry] of floodMuted) if (expiry <= now) floodMuted.delete(key);
    for (const [key, hits] of floodHits) {
      const recent = hits.filter((t) => now - t < (Number(config.limits.floodWindowMs) || 6000));
      if (recent.length) floodHits.set(key, recent);
      else floodHits.delete(key);
    }
    if (notified.size > 500) notified.clear();
  }

  /** Message d'attente formaté (traduit selon la langue de la conversation). */
  function waitMessage(seconds, label, language) {
    const wait = Math.max(1, Math.ceil(seconds));
    return i18n.say("cooldown", language, { wait, label });
  }

  /**
   * 1 + 2. Utilisateur banni ou rendu muet ?
   * @returns {{ blocked: boolean, silent?: boolean, message?: string, reason?: string }}
   */
  function checkModeration({ threadID, senderID, language }) {
    sweep();
    const uid = String(senderID || "");

    if (warnings && typeof warnings.isBanned === "function" && warnings.isBanned(uid)) {
      const info = warnings.banInfo(uid) || {};
      const key = `ban:${uid}`;
      if (notified.has(key)) return { blocked: true, silent: true, reason: "banni" };
      notified.add(key);
      const message = i18n.say("banned", language, { reason: info.reason || "" });
      return { blocked: true, message, reason: "banni" };
    }

    if (warnings && typeof warnings.isMuted === "function" && warnings.isMuted(threadID, uid)) {
      const info = warnings.muteInfo(threadID, uid) || {};
      const key = `mute:${threadID}:${uid}`;
      if (notified.has(key)) return { blocked: true, silent: true, reason: "muet" };
      notified.add(key);
      const remaining = formatDuration(info.remainingMs || 0);
      const message = i18n.say("muted", language, { remaining, reason: info.reason || "" });
      return { blocked: true, message, reason: "muet" };
    }

    return { blocked: false };
  }

  /** Libère la notification unique (après la fin d'un mute, par exemple). */
  function clearNotification(kind, key) {
    notified.delete(`${kind}:${key}`);
  }

  /**
   * 3. Anti-flood : trop de messages/commandes en peu de temps.
   * @returns {{ flooded: boolean, mutedUntil?: number, message?: string }}
   */
  function checkFlood({ senderID, isCommand = false, language }) {
    sweep();
    const uid = String(senderID || "");
    if (!uid) return { flooded: false };

    const windowMs = Math.max(1000, Number(config.limits.floodWindowMs) || 6000);
    const threshold = Math.max(2, Number(config.limits.floodMessages) || 6);
    const muteMs = Math.max(5000, Number(config.limits.floodMuteMs) || 60000);

    const mutedUntil = floodMuted.get(uid) || 0;
    if (mutedUntil > Date.now()) {
      const key = `flood:${uid}`;
      if (notified.has(key)) return { flooded: true, mutedUntil, silent: true };
      notified.add(key);
      const remaining = formatDuration(mutedUntil - Date.now());
      const message = i18n.say("floodPause", language, { remaining });
      return { flooded: true, mutedUntil, message };
    }

    const now = Date.now();
    const hits = (floodHits.get(uid) || []).filter((t) => now - t < windowMs);
    // Une commande compte double : c'est le comportement le plus sensible au spam.
    hits.push(now);
    if (isCommand) hits.push(now);
    floodHits.set(uid, hits);

    if (hits.length >= threshold) {
      floodHits.delete(uid);
      const until = now + muteMs;
      floodMuted.set(uid, until);
      notified.delete(`flood:${uid}`);
      if (stats && typeof stats.recordModeration === "function") stats.recordModeration();
      logger.warn(`Anti-flood : pause de ${muteMs} ms appliquée à ${uid}.`, "guard");
      const remaining = formatDuration(muteMs);
      const message = i18n.say("floodTrigger", language, {
        window: `${Math.round(windowMs / 1000)} s`,
        remaining
      });
      notified.add(`flood:${uid}`);
      return { flooded: true, mutedUntil: until, message };
    }

    return { flooded: false };
  }

  /** L'utilisateur est-il en pause anti-flood ? (sans enregistrer de nouveau hit) */
  function isFlooding(senderID) {
    return (floodMuted.get(String(senderID || "")) || 0) > Date.now();
  }

  /**
   * 4 + 5. Cooldowns.
   * @param {object} params { senderID, threadID, command, consume }
   * @returns {{ ok: boolean, remainingMs?: number, message?: string }}
   */
  function checkCooldown({ senderID, threadID, command, consume = true, language }) {
    sweep();
    const uid = String(senderID || "");
    if (!uid) return { ok: true };

    // Admin et propriétaire : pas de cooldown global (mais cooldown commande conservé).
    const isPrivileged = permissions && typeof permissions.isAdmin === "function" && permissions.isAdmin(uid);

    const globalMs = isPrivileged ? 0 : Math.max(0, Number(config.limits.globalCooldownMs) || 0);
    if (globalMs > 0) {
      const until = globalCooldown.get(uid) || 0;
      if (until > Date.now()) {
        return { ok: false, remainingMs: until - Date.now(), global: true };
      }
    }

    const seconds =
      command && command.cooldown !== null && command.cooldown !== undefined
        ? Number(command.cooldown)
        : Math.max(0, Number(config.limits.defaultCooldownSeconds) || 0);

    const key = `${uid}:${command ? command.name : "_"}`;
    if (seconds > 0) {
      const until = commandCooldown.get(key) || 0;
      if (until > Date.now()) {
        const remainingMs = until - Date.now();
        return {
          ok: false,
          remainingMs,
          message: waitMessage(remainingMs / 1000, command ? `/${command.name}` : "", language)
        };
      }
    }

    if (consume) {
      if (globalMs > 0) globalCooldown.set(uid, Date.now() + globalMs);
      if (seconds > 0) commandCooldown.set(key, Date.now() + seconds * 1000);
    }
    return { ok: true };
  }

  /** Libère le cooldown d'une commande (échec d'exécution, par exemple). */
  function releaseCooldown(senderID, command) {
    const key = `${String(senderID || "")}:${command ? command.name : "_"}`;
    commandCooldown.delete(key);
  }

  /** Temps restant d'un cooldown (pour l'affichage d'aide). */
  function remainingCooldown(senderID, command) {
    const key = `${String(senderID || "")}:${command ? command.name : "_"}`;
    const until = commandCooldown.get(key) || 0;
    return Math.max(0, until - Date.now());
  }

  /**
   * 6 + 7. Permissions et contexte.
   * @param {object} params { command, ctx, isGroup, groupAdminIDs }
   */
  function checkAccess({ command, ctx, isGroup, groupAdminIDs, language }) {
    if (command.groupOnly && !isGroup) {
      return { ok: false, message: i18n.say("groupOnly", language, { command: command.name }) };
    }

    if (!permissions || typeof permissions.canExecute !== "function") return { ok: true };

    const result = permissions.canExecute(command, ctx, { groupAdminIDs, isGroup });
    if (result.allowed) return { ok: true, level: result.level };

    const labels = {
      fr: { owner: "👑 Propriétaire", admin: "🛡️ Administrateur", groupadmin: "🧭 Admin du groupe" },
      en: { owner: "👑 Owner", admin: "🛡️ Administrator", groupadmin: "🧭 Group admin" }
    };
    const lang = i18n.resolveLanguage(language);
    const label = (labels[lang] || labels.fr)[result.level] || "";
    const message = i18n.say("denied", lang, { reason: result.reason || "", level: label, levelKey: result.level });

    if (stats && typeof stats.recordModeration === "function") stats.recordModeration();
    return { ok: false, message, reason: result.reason, level: result.level };
  }

  /** Réinitialise tous les états (après /reload). */
  function reset() {
    globalCooldown.clear();
    commandCooldown.clear();
    floodHits.clear();
    floodMuted.clear();
    notified.clear();
    lastSweep = Date.now();
  }

  function state() {
    sweep();
    return {
      globalCooldowns: globalCooldown.size,
      commandCooldowns: commandCooldown.size,
      floodTracked: floodHits.size,
      floodMuted: floodMuted.size,
      notified: notified.size
    };
  }

  return {
    checkModeration,
    checkFlood,
    isFlooding,
    checkCooldown,
    releaseCooldown,
    remainingCooldown,
    checkAccess,
    clearNotification,
    reset,
    state
  };
}

module.exports = { createGuard };
