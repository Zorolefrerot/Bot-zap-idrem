"use strict";

/**
 * services/stats.js
 * ---------------------------------------------------------------------------
 * Statistiques globales persistées (data/stats.json).
 *
 * Alimente /stats, /mystats, /commands, /topcommands, /topusers, /botinfo et
 * le health endpoint. Les classements internes sont bornés pour que le fichier
 * reste petit même après des mois d'activité.
 * ---------------------------------------------------------------------------
 */

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

const MAX_TRACKED_KEYS = 300;

/**
 * @param {object} deps
 * @param {object} deps.store
 * @param {object} [deps.config]
 * @param {object} [deps.logger]
 */
function createStats(deps = {}) {
  const { store } = deps;
  const logger = deps.logger || noopLogger;
  const collection = store.get("stats", {
    startedAt: Date.now(),
    bootCount: 0,
    totalMessages: 0,
    totalCommands: 0,
    totalErrors: 0,
    totalUnknown: 0,
    conversationReplies: 0,
    mentionReplies: 0,
    moderationActions: 0,
    commands: {},
    categories: {},
    unknownCommands: {},
    activeUsers: {},
    activeThreads: {},
    errors: [],
    lastReset: Date.now()
  });

  function data() {
    if (!collection.data || typeof collection.data !== "object") collection.data = {};
    const d = collection.data;
    for (const key of [
      "startedAt", "bootCount", "totalMessages", "totalCommands", "totalErrors",
      "totalUnknown", "conversationReplies", "mentionReplies", "moderationActions", "lastReset"
    ]) {
      d[key] = Number.isFinite(Number(d[key])) ? Number(d[key]) : 0;
    }
    for (const key of ["commands", "categories", "unknownCommands", "activeUsers", "activeThreads"]) {
      if (!d[key] || typeof d[key] !== "object" || Array.isArray(d[key])) d[key] = {};
    }
    if (!Array.isArray(d.errors)) d.errors = [];
    return d;
  }

  /** Incrémente un compteur dans une table bornée. */
  function bump(table, key, amount = 1) {
    const d = data();
    const map = d[table];
    const k = String(key || "").toLowerCase();
    if (!k) return;
    map[k] = (Number(map[k]) || 0) + amount;
    const keys = Object.keys(map);
    if (keys.length > MAX_TRACKED_KEYS) {
      const kept = Object.fromEntries(
        Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, MAX_TRACKED_KEYS)
      );
      d[table] = kept;
    }
  }

  function onBoot() {
    const d = data();
    d.startedAt = Date.now();
    d.bootCount += 1;
    collection.save();
    return d.startedAt;
  }

  function recordMessage({ threadID = "", userID = "" } = {}) {
    const d = data();
    d.totalMessages += 1;
    if (userID) bump("activeUsers", userID);
    if (threadID) bump("activeThreads", threadID);
    collection.save();
  }

  function recordCommand(name, { category = "", threadID = "", userID = "" } = {}) {
    const d = data();
    d.totalCommands += 1;
    bump("commands", name);
    if (category) bump("categories", category);
    if (userID) bump("activeUsers", userID);
    if (threadID) bump("activeThreads", threadID);
    collection.save();
  }

  function recordUnknown(name) {
    const d = data();
    d.totalUnknown += 1;
    bump("unknownCommands", name);
    collection.save();
  }

  function recordConversation() {
    const d = data();
    d.conversationReplies += 1;
    collection.save();
  }

  function recordMention() {
    const d = data();
    d.mentionReplies += 1;
    collection.save();
  }

  function recordModeration() {
    const d = data();
    d.moderationActions += 1;
    collection.save();
  }

  /** Enregistre une erreur technique (sans donnée sensible : message déjà nettoyé). */
  function recordError({ command = "", scope = "", message = "" } = {}) {
    const d = data();
    d.totalErrors += 1;
    d.errors.push({ at: Date.now(), command: String(command || ""), scope: String(scope || ""), message: String(message || "").slice(0, 300) });
    if (d.errors.length > 50) d.errors = d.errors.slice(-50);
    collection.save();
  }

  function topCommands(limit = 10) {
    const d = data();
    return Object.entries(d.commands)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)))
      .map(([name, count]) => ({ name, count }));
  }

  function topCategories(limit = 12) {
    const d = data();
    return Object.entries(d.categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, Number(limit) || 12))
      .map(([name, count]) => ({ name, count }));
  }

  function topUsers(limit = 10) {
    const d = data();
    return Object.entries(d.activeUsers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)))
      .map(([userID, count]) => ({ userID, count }));
  }

  function topThreads(limit = 10) {
    const d = data();
    return Object.entries(d.activeThreads)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)))
      .map(([threadID, count]) => ({ threadID, count }));
  }

  function unknownTop(limit = 8) {
    const d = data();
    return Object.entries(d.unknownCommands)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, Number(limit) || 8))
      .map(([name, count]) => ({ name, count }));
  }

  function lastErrors(limit = 10) {
    const d = data();
    return d.errors.slice(-Math.max(1, Number(limit) || 10)).reverse();
  }

  function uptimeMs(sinceBoot = true) {
    const d = data();
    return Math.max(0, Date.now() - (sinceBoot ? d.startedAt || Date.now() : d.lastReset || Date.now()));
  }

  /** Vue consolidée pour /stats et /health. */
  function summary() {
    const d = data();
    return {
      startedAt: d.startedAt,
      bootCount: d.bootCount,
      uptimeMs: uptimeMs(),
      totalMessages: d.totalMessages,
      totalCommands: d.totalCommands,
      totalErrors: d.totalErrors,
      totalUnknown: d.totalUnknown,
      conversationReplies: d.conversationReplies,
      mentionReplies: d.mentionReplies,
      moderationActions: d.moderationActions,
      uniqueCommands: Object.keys(d.commands).length,
      trackedUsers: Object.keys(d.activeUsers).length,
      trackedThreads: Object.keys(d.activeThreads).length,
      topCommands: topCommands(5),
      topCategories: topCategories(5)
    };
  }

  function reset() {
    const before = data().totalCommands;
    collection.data = {
      startedAt: Date.now(),
      bootCount: data().bootCount,
      totalMessages: 0,
      totalCommands: 0,
      totalErrors: 0,
      totalUnknown: 0,
      conversationReplies: 0,
      mentionReplies: 0,
      moderationActions: 0,
      commands: {},
      categories: {},
      unknownCommands: {},
      activeUsers: {},
      activeThreads: {},
      errors: [],
      lastReset: Date.now()
    };
    collection.save();
    logger.info(`Statistiques réinitialisées (${before} commandes effacées).`, "stats");
    return true;
  }

  return {
    data,
    onBoot,
    recordMessage,
    recordCommand,
    recordUnknown,
    recordConversation,
    recordMention,
    recordModeration,
    recordError,
    topCommands,
    topCategories,
    topUsers,
    topThreads,
    unknownTop,
    lastErrors,
    uptimeMs,
    summary,
    reset,
    store: collection
  };
}

module.exports = { createStats };
