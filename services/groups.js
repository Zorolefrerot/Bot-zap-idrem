"use strict";

/**
 * services/groups.js
 * ---------------------------------------------------------------------------
 * Suivi des conversations (data/groups.json) + cache des informations de
 * thread (nom, membres, administrateurs).
 *
 * Le bot fonctionne en message privé ET en groupe : dans les deux cas la clé
 * est le threadID. Les réglages, eux, vivent dans services/settings.js.
 *
 * Les appels à l'API Facebook (getThreadInfo / getUserInfo) sont mis en cache
 * et toujours protégés : un échec ne doit jamais bloquer une commande.
 * ---------------------------------------------------------------------------
 */

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };
const { callApiMethod } = require("../utils/helpers");

const THREAD_CACHE_MS = 10 * 60 * 1000;
const USER_CACHE_MS = 30 * 60 * 1000;

function tid(value) {
  const str = String(value ?? "").trim();
  return /^\d{5,25}$/.test(str) ? str : "";
}

/**
 * @param {object} deps
 * @param {object} deps.store
 * @param {object} deps.config
 * @param {object} [deps.logger]
 * @param {() => object|null} [deps.getApi]
 */
function createGroups(deps = {}) {
  const { store, config } = deps;
  const logger = deps.logger || noopLogger;
  const getApi = typeof deps.getApi === "function" ? deps.getApi : () => null;
  const collection = store.get("groups", {});

  /** @type {Map<string, {at: number, info: object}>} */
  const threadCache = new Map();
  /** @type {Map<string, {at: number, name: string}>} */
  const userCache = new Map();

  function defaults(threadID) {
    return {
      threadID,
      name: "",
      isGroup: false,
      memberCount: 0,
      admins: [],
      messages: 0,
      commandsUsed: 0,
      joinedAt: Date.now(),
      lastActivity: Date.now()
    };
  }

  function repair(record, threadID) {
    const base = defaults(threadID);
    if (!record || typeof record !== "object" || Array.isArray(record)) return base;
    const merged = { ...base, ...record };
    merged.threadID = threadID;
    merged.name = String(merged.name || "").slice(0, 120);
    merged.isGroup = Boolean(merged.isGroup);
    merged.memberCount = Math.max(0, Number(merged.memberCount) || 0);
    merged.messages = Math.max(0, Number(merged.messages) || 0);
    merged.commandsUsed = Math.max(0, Number(merged.commandsUsed) || 0);
    merged.joinedAt = Number(merged.joinedAt) || base.joinedAt;
    merged.lastActivity = Number(merged.lastActivity) || base.lastActivity;
    merged.admins = Array.isArray(merged.admins) ? merged.admins.map((a) => tid(a)).filter(Boolean).slice(0, 100) : [];
    return merged;
  }

  function get(threadID) {
    const id = tid(threadID);
    if (!id) return null;
    const existing = collection.data[id];
    const record = repair(existing, id);
    collection.data[id] = record;
    if (!existing) collection.save();
    return record;
  }

  function update(threadID, patch) {
    const record = get(threadID);
    if (!record) return null;
    Object.assign(record, patch);
    collection.data[record.threadID] = repair(record, record.threadID);
    collection.save();
    return collection.data[record.threadID];
  }

  /** Enregistre une activité (message ou commande) dans la conversation. */
  function recordActivity(threadID, { isGroup = false, name = "", isCommand = false } = {}) {
    const id = tid(threadID);
    if (!id) return null;
    const record = get(id);
    record.messages += 1;
    if (isCommand) record.commandsUsed += 1;
    if (isGroup) record.isGroup = true;
    if (name && record.name !== name) record.name = String(name).slice(0, 120);
    record.lastActivity = Date.now();
    collection.save();
    return record;
  }

  function count() {
    return Object.keys(collection.data).length;
  }

  function groupCount() {
    return Object.values(collection.data).filter((g) => g && g.isGroup).length;
  }

  function all() {
    return Object.values(collection.data).map((r) => repair(r, r.threadID));
  }

  function top(limit = 10) {
    return all()
      .sort((a, b) => b.messages - a.messages)
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
  }

  // --- Informations Facebook (cache) --------------------------------------

  /**
   * Récupère les informations d'un thread (nom, membres, admins).
   * Retourne toujours un objet : `{ ok:false }` si l'API est indisponible.
   *
   * @param {string} threadID
   * @param {{ force?: boolean }} [options]
   */
  async function threadInfo(threadID, options = {}) {
    const id = tid(threadID);
    if (!id) return { ok: false, error: "threadID invalide." };

    const cached = threadCache.get(id);
    if (!options.force && cached && Date.now() - cached.at < THREAD_CACHE_MS) {
      return { ok: true, cached: true, ...cached.info };
    }

    const api = getApi();
    if (!api || typeof api.getThreadInfo !== "function") {
      // Repli : informations déjà connues localement.
      const record = collection.data[id];
      if (record) {
        return {
          ok: true,
          cached: true,
          offline: true,
          name: record.name,
          isGroup: record.isGroup,
          memberCount: record.memberCount,
          adminIDs: record.admins,
          participantIDs: []
        };
      }
      return { ok: false, error: "API indisponible." };
    }

    try {
      const info = await callApiMethod(api.getThreadInfo.bind(api), [id], { timeoutMs: 15000 });
      const normalized = normalizeThreadInfo(info);
      threadCache.set(id, { at: Date.now(), info: normalized });
      const record = get(id);
      if (normalized.name) record.name = normalized.name;
      record.isGroup = normalized.isGroup;
      record.memberCount = normalized.memberCount;
      record.admins = normalized.adminIDs;
      collection.save();
      return { ok: true, ...normalized };
    } catch (err) {
      logger.warn(`getThreadInfo échoué (${id}) : ${err && err.message ? err.message : err}`, "groups");
      const record = collection.data[id];
      if (record) {
        return {
          ok: true,
          offline: true,
          name: record.name,
          isGroup: record.isGroup,
          memberCount: record.memberCount,
          adminIDs: record.admins,
          participantIDs: []
        };
      }
      return { ok: false, error: err && err.message ? err.message : "erreur inconnue" };
    }
  }

  function normalizeThreadInfo(info) {
    const source = info || {};
    const participants = Array.isArray(source.participantIDs)
      ? source.participantIDs
      : Array.isArray(source.participants)
        ? source.participants.map((p) => (typeof p === "string" ? p : p && (p.id || p.userID))).filter(Boolean)
        : [];
    const adminIDs = Array.isArray(source.adminIDs)
      ? source.adminIDs.map((a) => tid(a)).filter(Boolean)
      : [];
    const isGroup = source.isGroup === true || source.isGroup === "true" || participants.length > 2;
    return {
      name: String(source.name || source.threadName || "").slice(0, 120),
      isGroup,
      memberCount: participants.length || Number(source.memberCount) || 0,
      participantIDs: participants.map((p) => tid(p)).filter(Boolean),
      adminIDs,
      emoji: source.emoji || null,
      color: source.color || null
    };
  }

  /**
   * Informations publiques d'un utilisateur (nom, photo de profil, vanity).
   * Retourne `{ ok:false }` si l'API est indisponible — jamais de valeur inventée.
   *
   * @param {string} userID
   * @param {{ force?: boolean }} [options]
   */
  async function userInfo(userID, options = {}) {
    const id = tid(userID);
    if (!id) return { ok: false, error: "UID invalide." };

    const cached = userCache.get(id);
    if (!options.force && cached && cached.info && Date.now() - cached.at < USER_CACHE_MS) {
      return { ok: true, cached: true, ...cached.info };
    }

    const api = getApi();
    if (!api || typeof api.getUserInfo !== "function") {
      if (cached && cached.info) return { ok: true, cached: true, offline: true, ...cached.info };
      return { ok: false, error: "API indisponible." };
    }

    try {
      const res = await callApiMethod(api.getUserInfo.bind(api), [[id]], { timeoutMs: 15000 });
      const raw = res && res[id] ? res[id] : res;
      if (!raw || typeof raw !== "object") return { ok: false, error: "Aucune information renvoyée." };
      const info = {
        name: String(raw.name || "").slice(0, 80),
        firstName: String(raw.firstName || "").slice(0, 40),
        vanity: String(raw.vanity || "").slice(0, 60),
        avatar: String(raw.avatar || raw.thumbSrc || raw.profilePicture || "").slice(0, 600),
        isFriend: raw.isFriend === true || raw.isFriend === "true",
        gender: String(raw.gender || "")
      };
      userCache.set(id, { at: Date.now(), name: info.name, info });
      return { ok: true, ...info };
    } catch (err) {
      logger.debug(`getUserInfo échoué (${id}) : ${err.message}`, "groups");
      if (cached && cached.info) return { ok: true, cached: true, offline: true, ...cached.info };
      return { ok: false, error: err && err.message ? err.message : "erreur inconnue" };
    }
  }

  /** Nom d'un utilisateur (cache + repli sur le profil connu). */
  async function userName(userID, fallback = "") {
    const id = tid(userID);
    if (!id) return fallback || "";
    const cached = userCache.get(id);
    if (cached && Date.now() - cached.at < USER_CACHE_MS) return cached.name;

    const info = await userInfo(userID, {});
    if (info.ok && info.name) return info.name;
    if (fallback) {
      userCache.set(id, { at: Date.now(), name: fallback, info: { name: fallback } });
      return fallback;
    }
    return "";
  }

  /** Vide le cache (après /reload ou un changement de compte). */
  function clearCache() {
    threadCache.clear();
    userCache.clear();
  }

  return {
    get,
    update,
    recordActivity,
    count,
    groupCount,
    all,
    top,
    threadInfo,
    normalizeThreadInfo,
    userInfo,
    userName,
    clearCache,
    defaults,
    store: collection
  };
}

module.exports = { createGroups };
