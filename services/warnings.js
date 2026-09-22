"use strict";

/**
 * services/warnings.js
 * ---------------------------------------------------------------------------
 * Modération persistée (data/warnings.json).
 *
 *   bans  → { userID: { reason, by, at } }                     (global)
 *   warns → { threadID: { userID: [ { reason, by, at } ] } }   (par groupe)
 *   mutes → { threadID: { userID: { until, by, reason } } }    (par groupe)
 *
 * Les avertissements déclenchent une action automatique au-delà de
 * `limits.maxWarns` (mute temporaire), pour éviter qu'un modérateur doive
 * surveiller en permanence.
 * ---------------------------------------------------------------------------
 */

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

const DEFAULT_AUTO_MUTE_MINUTES = 10;

function id(value) {
  const str = String(value ?? "").trim();
  return /^\d{5,25}$/.test(str) ? str : "";
}

/**
 * @param {object} deps
 * @param {object} deps.store
 * @param {object} deps.config
 * @param {object} [deps.logger]
 * @param {object} [deps.permissions] pour protéger le propriétaire
 */
function createWarnings(deps = {}) {
  const { store, config } = deps;
  const logger = deps.logger || noopLogger;
  const permissions = deps.permissions || null;
  const collection = store.get("warnings", { bans: {}, warns: {}, mutes: {}, kicks: [] });

  function ensure() {
    if (!collection.data || typeof collection.data !== "object") {
      collection.data = { bans: {}, warns: {}, mutes: {}, kicks: [] };
    }
    if (!collection.data.bans) collection.data.bans = {};
    if (!collection.data.warns) collection.data.warns = {};
    if (!collection.data.mutes) collection.data.mutes = {};
    if (!Array.isArray(collection.data.kicks)) collection.data.kicks = [];
    return collection.data;
  }

  function maxWarns() {
    return Math.max(1, Number(config.limits.maxWarns) || 3);
  }

  /** Durée (minutes) du mute appliqué automatiquement au dernier avertissement. */
  function autoMuteMinutes() {
    return DEFAULT_AUTO_MUTE_MINUTES;
  }

  /** Le propriétaire ne peut jamais être sanctionné. */
  function isProtected(userID) {
    const uid = id(userID);
    if (!uid) return true;
    const ownerUID = id(config.owner && config.owner.uid);
    if (ownerUID && uid === ownerUID) return true;
    if (permissions && typeof permissions.isOwner === "function" && permissions.isOwner(uid)) return true;
    return false;
  }

  // --- Bannissements (bot entier) -----------------------------------------

  function ban(userID, reason = "", by = "") {
    const uid = id(userID);
    if (!uid) return { ok: false, error: "UID invalide." };
    if (isProtected(uid)) return { ok: false, error: "Le propriétaire du bot ne peut pas être banni." };
    const data = ensure();
    data.bans[uid] = { reason: String(reason || "").slice(0, 200), by: id(by), at: Date.now() };
    collection.save();
    logger.info(`Bannissement : ${uid} (par ${id(by) || "?"}).`, "warnings");
    return { ok: true, at: data.bans[uid].at };
  }

  function unban(userID) {
    const uid = id(userID);
    if (!uid) return { ok: false, error: "UID invalide." };
    const data = ensure();
    if (!data.bans[uid]) return { ok: false, error: "Cet utilisateur n'est pas banni." };
    delete data.bans[uid];
    collection.save();
    return { ok: true };
  }

  function isBanned(userID) {
    const data = ensure();
    return Boolean(data.bans[id(userID)]);
  }

  function banInfo(userID) {
    const data = ensure();
    return data.bans[id(userID)] || null;
  }

  function bannedList() {
    const data = ensure();
    return Object.entries(data.bans).map(([userID, entry]) => ({ userID, ...entry }));
  }

  // --- Avertissements (par groupe) ----------------------------------------

  function warnBucket(threadID, userID, create = false) {
    const data = ensure();
    const t = id(threadID);
    const u = id(userID);
    if (!t || !u) return null;
    if (!data.warns[t]) {
      if (!create) return null;
      data.warns[t] = {};
    }
    if (!data.warns[t][u]) {
      if (!create) return null;
      data.warns[t][u] = [];
    }
    return data.warns[t][u];
  }

  /**
   * Ajoute un avertissement.
   * @returns {{ ok: boolean, total?: number, max?: number, autoAction?: object, error?: string }}
   */
  function addWarn(threadID, userID, reason = "", by = "") {
    const uid = id(userID);
    if (!uid) return { ok: false, error: "UID invalide." };
    if (isProtected(uid)) return { ok: false, error: "Le propriétaire du bot ne peut pas être averti." };

    const bucket = warnBucket(threadID, userID, true);
    if (!bucket) return { ok: false, error: "Contexte invalide." };

    bucket.push({ reason: String(reason || "non précisé").slice(0, 200), by: id(by), at: Date.now() });
    collection.save();

    const total = bucket.length;
    const max = maxWarns();
    if (total >= max) {
      // Action automatique : mute temporaire + remise à zéro des warns.
      const minutes = DEFAULT_AUTO_MUTE_MINUTES;
      mute(threadID, userID, minutes, id(by) || "auto", `${total} avertissements`);
      bucket.length = 0;
      collection.save();
      logger.info(`${uid} mute automatiquement ${minutes} min (${total} warns).`, "warnings");
      return { ok: true, total, max, autoAction: { type: "mute", minutes } };
    }
    return { ok: true, total, max };
  }

  function warns(threadID, userID) {
    const bucket = warnBucket(threadID, userID);
    return bucket ? bucket.map((w) => ({ ...w })) : [];
  }

  function warnCount(threadID, userID) {
    const bucket = warnBucket(threadID, userID);
    return bucket ? bucket.length : 0;
  }

  function clearWarns(threadID, userID) {
    const bucket = warnBucket(threadID, userID);
    if (!bucket || !bucket.length) return { ok: false, error: "Aucun avertissement à effacer." };
    const removed = bucket.length;
    bucket.length = 0;
    collection.save();
    return { ok: true, removed };
  }

  function removeWarn(threadID, userID, index) {
    const bucket = warnBucket(threadID, userID);
    if (!bucket || !bucket.length) return { ok: false, error: "Aucun avertissement." };
    const i = Math.trunc(Number(index));
    if (!Number.isFinite(i) || i < 1 || i > bucket.length) {
      return { ok: false, error: `Numéro invalide (1 à ${bucket.length}).` };
    }
    const removed = bucket.splice(i - 1, 1)[0];
    collection.save();
    return { ok: true, removed, total: bucket.length };
  }

  /** Tous les utilisateurs avertis d'un groupe. */
  function threadWarns(threadID) {
    const data = ensure();
    const t = id(threadID);
    const bucket = (t && data.warns[t]) || {};
    return Object.entries(bucket)
      .filter(([, list]) => Array.isArray(list) && list.length)
      .map(([userID, list]) => ({ userID, count: list.length, last: list[list.length - 1] }));
  }

  // --- Mutes (par groupe) --------------------------------------------------

  function mute(threadID, userID, minutes = 10, by = "", reason = "") {
    const uid = id(userID);
    const t = id(threadID);
    if (!uid || !t) return { ok: false, error: "Contexte invalide." };
    if (isProtected(uid)) return { ok: false, error: "Le propriétaire du bot ne peut pas être rendu muet." };
    const mins = Math.min(1440, Math.max(1, Math.floor(Number(minutes) || 10)));
    const data = ensure();
    if (!data.mutes[t]) data.mutes[t] = {};
    data.mutes[t][uid] = { until: Date.now() + mins * 60000, by: id(by), reason: String(reason || "").slice(0, 200), minutes: mins };
    collection.save();
    return { ok: true, minutes: mins, until: data.mutes[t][uid].until };
  }

  function unmute(threadID, userID) {
    const data = ensure();
    const t = id(threadID);
    const u = id(userID);
    if (!t || !u) return { ok: false, error: "Contexte invalide." };
    if (!data.mutes[t] || !data.mutes[t][u]) return { ok: false, error: "Cet utilisateur n'est pas muet." };
    delete data.mutes[t][u];
    collection.save();
    return { ok: true };
  }

  function muteInfo(threadID, userID) {
    const data = ensure();
    const t = id(threadID);
    const u = id(userID);
    const entry = data.mutes && data.mutes[t] && data.mutes[t][u];
    if (!entry) return null;
    if (entry.until && entry.until <= Date.now()) {
      delete data.mutes[t][u];
      collection.save();
      return null;
    }
    return { ...entry, remainingMs: Math.max(0, entry.until - Date.now()) };
  }

  function isMuted(threadID, userID) {
    return Boolean(muteInfo(threadID, userID));
  }

  // --- Historique des expulsions ------------------------------------------

  function recordKick(threadID, userID, by, reason = "") {
    const data = ensure();
    data.kicks.push({ threadID: id(threadID), userID: id(userID), by: id(by), reason: String(reason || "").slice(0, 200), at: Date.now() });
    if (data.kicks.length > 200) data.kicks = data.kicks.slice(-200);
    collection.save();
  }

  function kicks(limit = 10) {
    const data = ensure();
    return data.kicks.slice(-Math.max(1, Math.min(100, Number(limit) || 10))).reverse();
  }

  function stats() {
    const data = ensure();
    const warnTotal = Object.values(data.warns).reduce(
      (sum, thread) => sum + Object.values(thread).reduce((s, list) => s + (Array.isArray(list) ? list.length : 0), 0),
      0
    );
    const muteTotal = Object.values(data.mutes).reduce((sum, thread) => sum + Object.keys(thread).length, 0);
    return { bans: Object.keys(data.bans).length, warns: warnTotal, mutes: muteTotal, kicks: data.kicks.length };
  }

  return {
    ensure,
    maxWarns,
    autoMuteMinutes,
    isProtected,
    ban,
    unban,
    isBanned,
    banInfo,
    bannedList,
    addWarn,
    warns,
    warnCount,
    clearWarns,
    removeWarn,
    threadWarns,
    mute,
    unmute,
    muteInfo,
    isMuted,
    recordKick,
    kicks,
    stats,
    store: collection
  };
}

module.exports = { createWarnings };
