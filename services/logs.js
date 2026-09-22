"use strict";

/**
 * services/logs.js
 * ---------------------------------------------------------------------------
 * Journal consultable depuis Messenger (/logs), persisté dans data/logs.json.
 *
 * Deux sources :
 *   1. les événements métier (commandes admin, modération, connexions) ;
 *   2. les lignes warn/error du logger console, via `attach(logger)`.
 *
 * Les messages passent TOUJOURS par sanitize() : aucun cookie, token ou
 * identifiant de session Facebook ne peut se retrouver dans le journal.
 * Le tampon est borné (`security.logRetention`) pour rester léger.
 * ---------------------------------------------------------------------------
 */

const { sanitize } = require("../utils/logger");

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };
const LEVELS = ["debug", "info", "warn", "error"];

/**
 * @param {object} deps
 * @param {object} deps.store
 * @param {object} deps.config
 * @param {object} [deps.logger]
 */
function createLogs(deps = {}) {
  const { store, config } = deps;
  const logger = deps.logger || noopLogger;
  const collection = store.get("logs", []);

  function retention() {
    return Math.max(20, Number((config.security && config.security.logRetention) || 300));
  }

  function ensureArray() {
    if (!Array.isArray(collection.data)) collection.data = [];
    return collection.data;
  }

  /**
   * Ajoute une entrée.
   * @param {"debug"|"info"|"warn"|"error"} level
   * @param {string} scope
   * @param {string} message
   * @param {{ userID?: string, threadID?: string, command?: string }} [meta]
   */
  function add(level, scope, message, meta = {}) {
    const entries = ensureArray();
    const cleanLevel = LEVELS.includes(level) ? level : "info";
    entries.push({
      at: Date.now(),
      level: cleanLevel,
      scope: String(scope || "bot").slice(0, 24),
      message: sanitize(message).slice(0, 400),
      userID: String(meta.userID || "").slice(0, 25) || undefined,
      threadID: String(meta.threadID || "").slice(0, 25) || undefined,
      command: String(meta.command || "").slice(0, 32) || undefined
    });
    const max = retention();
    if (entries.length > max) collection.data = entries.slice(-max);
    collection.save();
  }

  const info = (scope, message, meta) => add("info", scope, message, meta);
  const warn = (scope, message, meta) => add("warn", scope, message, meta);
  const error = (scope, message, meta) => add("error", scope, message, meta);
  const debug = (scope, message, meta) => add("debug", scope, message, meta);

  /**
   * Liste filtrée, de la plus récente à la plus ancienne.
   * @param {{ limit?: number, level?: string, scope?: string, search?: string }} [options]
   */
  function list(options = {}) {
    const entries = ensureArray();
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 15));
    let out = entries;
    if (options.level && LEVELS.includes(String(options.level))) {
      out = out.filter((e) => e.level === options.level);
    }
    if (options.scope) {
      const scope = String(options.scope).toLowerCase();
      out = out.filter((e) => String(e.scope).toLowerCase().includes(scope));
    }
    if (options.search) {
      const needle = String(options.search).toLowerCase();
      out = out.filter((e) => String(e.message).toLowerCase().includes(needle));
    }
    return out.slice(-limit).reverse().map((e) => ({ ...e }));
  }

  function count(level) {
    const entries = ensureArray();
    if (!level) return entries.length;
    return entries.filter((e) => e.level === level).length;
  }

  function clear() {
    const removed = ensureArray().length;
    collection.data = [];
    collection.save();
    logger.info(`Journal vidé (${removed} entrées supprimées).`, "logs");
    return removed;
  }

  /** Relie le logger console au journal persisté (warn/error uniquement). */
  function attach(consoleLogger) {
    if (!consoleLogger || typeof consoleLogger.addSink !== "function") return false;
    consoleLogger.addSink((entry) => {
      if (entry.level !== "warn" && entry.level !== "error") return;
      // On évite la boucle : le sink n'écrit que dans le store, pas dans le logger.
      const entries = ensureArray();
      entries.push({
        at: entry.at || Date.now(),
        level: entry.level,
        scope: String(entry.scope || "console").slice(0, 24),
        message: String(entry.message || "").slice(0, 400)
      });
      const max = retention();
      if (entries.length > max) collection.data = entries.slice(-max);
      collection.save();
    });
    return true;
  }

  const LEVEL_ICONS = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "⛔" };

  function formatTime(ts) {
    const d = new Date(Number(ts) || Date.now());
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return {
    add,
    info,
    warn,
    error,
    debug,
    list,
    count,
    clear,
    attach,
    formatTime,
    LEVEL_ICONS,
    store: collection
  };
}

module.exports = { createLogs };
