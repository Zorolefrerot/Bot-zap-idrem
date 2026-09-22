"use strict";

/**
 * services/scheduler.js
 * ---------------------------------------------------------------------------
 * Rappels programmés (/remind).
 *
 * Les rappels sont persistés (data/reminders.json) : un redémarrage Render ne
 * les fait pas disparaître. Au démarrage, les rappels déjà échus sont envoyés
 * immédiatement (ou annulés s'ils sont trop vieux).
 * ---------------------------------------------------------------------------
 */

const { shortId } = require("../utils/random");
const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

const MAX_PER_USER = 5;
const MIN_DELAY_MS = 10 * 1000;
const MAX_DELAY_MS = 30 * 24 * 3600 * 1000;
const STALE_MS = 12 * 3600 * 1000; // au-delà, un rappel en retard est jeté

/**
 * @param {object} deps
 * @param {object} deps.store
 * @param {object} [deps.config]
 * @param {object} [deps.logger]
 * @param {(reminder: object) => Promise<void>} [deps.onFire] appelé à l'échéance
 * @param {number} [deps.tickMs]
 */
function createScheduler(deps = {}) {
  const { store } = deps;
  const logger = deps.logger || noopLogger;
  const onFire = typeof deps.onFire === "function" ? deps.onFire : async () => {};
  const tickMs = Math.max(1000, Number(deps.tickMs) || 5000);
  const collection = store ? store.get("reminders", []) : { data: [], save() {} };

  let timer = null;
  let firing = false;

  function all() {
    if (!Array.isArray(collection.data)) collection.data = [];
    return collection.data;
  }

  /**
   * Ajoute un rappel.
   * @param {object} params { threadID, userID, text, delayMs, at }
   */
  function add({ threadID, userID, text, delayMs, at }) {
    const list = all();
    const mine = list.filter((r) => String(r.userID) === String(userID));
    if (mine.length >= MAX_PER_USER) {
      return { ok: false, error: `Limite atteinte : ${MAX_PER_USER} rappels simultanés. Annule-en un avec /remind cancel <id>.` };
    }

    let fireAt = Number(at) || 0;
    if (!fireAt && delayMs) {
      const delay = Number(delayMs);
      if (!Number.isFinite(delay) || delay < MIN_DELAY_MS) {
        return { ok: false, error: "Délai trop court (minimum 10 secondes)." };
      }
      if (delay > MAX_DELAY_MS) return { ok: false, error: "Délai trop long (maximum 30 jours)." };
      fireAt = Date.now() + delay;
    }
    if (!fireAt || fireAt <= Date.now()) return { ok: false, error: "Échéance invalide." };

    const reminder = {
      id: shortId(5),
      threadID: String(threadID || ""),
      userID: String(userID || ""),
      text: String(text || "").replace(/\s+/g, " ").trim().slice(0, 300),
      at: fireAt,
      createdAt: Date.now()
    };
    list.push(reminder);
    collection.save();
    logger.debug(`Rappel ${reminder.id} programmé pour ${new Date(fireAt).toISOString()}.`, "scheduler");
    return { ok: true, reminder, delayMs: fireAt - Date.now() };
  }

  function list(threadID, userID) {
    return all()
      .filter((r) => (threadID ? String(r.threadID) === String(threadID) : true))
      .filter((r) => (userID ? String(r.userID) === String(userID) : true))
      .sort((a, b) => a.at - b.at);
  }

  function cancel(id, userID) {
    const list = all();
    const index = list.findIndex((r) => String(r.id).toLowerCase() === String(id).toLowerCase() && (!userID || String(r.userID) === String(userID)));
    if (index === -1) return { ok: false, error: "Rappel introuvable." };
    const removed = list.splice(index, 1)[0];
    collection.save();
    return { ok: true, reminder: removed };
  }

  function clear(threadID) {
    const list = all();
    const remaining = list.filter((r) => String(r.threadID) !== String(threadID));
    const removed = list.length - remaining.length;
    collection.data = remaining;
    collection.save();
    return removed;
  }

  /** Envoie les rappels échus. */
  async function tick() {
    if (firing) return 0;
    firing = true;
    let fired = 0;
    try {
      const list = all();
      const now = Date.now();
      const due = list.filter((r) => Number(r.at) <= now);
      if (!due.length) return 0;

      const remaining = list.filter((r) => !due.includes(r));
      collection.data = remaining;
      collection.save();

      for (const reminder of due) {
        if (now - Number(reminder.at) > STALE_MS) {
          logger.debug(`Rappel ${reminder.id} trop vieux (${Math.round((now - reminder.at) / 60000)} min) → abandonné.`, "scheduler");
          continue;
        }
        try {
          await onFire(reminder);
          fired += 1;
        } catch (err) {
          logger.error(`Envoi du rappel ${reminder.id} échoué : ${err.message}`, "scheduler");
        }
      }
    } finally {
      firing = false;
    }
    return fired;
  }

  function start() {
    if (timer) return false;
    timer = setInterval(() => {
      tick().catch((err) => logger.error(`Scheduler : ${err.message}`, "scheduler"));
    }, tickMs);
    if (typeof timer.unref === "function") timer.unref();
    return true;
  }

  function stop() {
    if (!timer) return false;
    clearInterval(timer);
    timer = null;
    return true;
  }

  function count() {
    return all().length;
  }

  return { add, list, cancel, clear, tick, start, stop, count, MAX_PER_USER, MIN_DELAY_MS, MAX_DELAY_MS, store: collection };
}

/**
 * Convertit une durée textuelle en millisecondes.
 * Accepte : "30s", "5m", "2h", "1j", "1d", "90 sec", "2 heures", "1j2h".
 *
 * @param {string} input
 * @returns {{ ok: boolean, ms?: number, error?: string, label?: string }}
 */
function parseDuration(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return { ok: false, error: "Aucun délai indiqué." };

  const units = [
    { re: /(\d+(?:[.,]\d+)?)\s*(?:j|jr|jours?|days?|d)/g, ms: 86400000, label: "j" },
    { re: /(\d+(?:[.,]\d+)?)\s*(?:h|heures?|hours?|hrs?)/g, ms: 3600000, label: "h" },
    { re: /(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minutes?)/g, ms: 60000, label: "min" },
    { re: /(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs|secondes?|seconds?)/g, ms: 1000, label: "s" }
  ];

  let total = 0;
  let matched = false;
  let rest = raw;
  const parts = [];

  for (const unit of units) {
    const re = new RegExp(unit.re.source, "g");
    let match;
    while ((match = re.exec(rest)) !== null) {
      const value = Number(String(match[1]).replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) continue;
      total += value * unit.ms;
      parts.push(`${Math.round(value * 100) / 100}${unit.label}`);
      matched = true;
      rest = rest.replace(match[0], " ");
    }
  }

  // Un nombre seul est interprété comme des minutes.
  if (!matched) {
    const onlyNumber = raw.match(/^(\d+(?:[.,]\d+)?)$/);
    if (onlyNumber) {
      const value = Number(onlyNumber[1].replace(",", "."));
      if (Number.isFinite(value) && value > 0) {
        total = value * 60000;
        parts.push(`${value}min`);
        matched = true;
      }
    }
  }

  if (!matched || total <= 0) return { ok: false, error: "Délai illisible. Exemples : 30s, 5m, 2h, 1j." };
  return { ok: true, ms: total, label: parts.join(" ") };
}

module.exports = { createScheduler, parseDuration };
