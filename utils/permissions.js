"use strict";

/**
 * utils/permissions.js
 * ---------------------------------------------------------------------------
 * Rôles et droits d'accès.
 *
 *   OWNER  → UID du propriétaire (config.owner.uid / OWNER_UID). Droits totaux.
 *   ADMIN  → utilisateurs promus par le propriétaire via /admin add.
 *   USER   → tout le monde.
 *
 * Niveau de commande (`command.permissions`) :
 *   "public"     → tous les utilisateurs
 *   "user"       → identique à public (alias lisible)
 *   "groupadmin" → propriétaire, administrateur du bot OU admin du groupe
 *   "admin"      → propriétaire + administrateurs du bot
 *   "owner"      → propriétaire uniquement
 *
 * Règle de sécurité absolue : un utilisateur ne peut JAMAIS s'attribuer
 * lui-même un rôle (voir services/users.js#setRole).
 * ---------------------------------------------------------------------------
 */

const { normalizeUID, safeReply, callApiMethod } = require("./helpers");

/** Ordre hiérarchique des rôles (plus grand = plus de droits). */
const ROLE_LEVEL = { user: 1, groupadmin: 2, admin: 3, owner: 4 };

const ROLE_LABEL = {
  owner: "👑 Propriétaire",
  admin: "🛡️ Administrateur",
  groupadmin: "🧭 Admin du groupe",
  user: "👤 Utilisateur"
};

const LEVEL_ALIASES = {
  public: "public",
  tous: "public",
  all: "public",
  user: "public",
  utilisateur: "public",
  groupadmin: "groupadmin",
  group: "groupadmin",
  groupe: "groupadmin",
  admin: "admin",
  administrateur: "admin",
  mods: "admin",
  owner: "owner",
  proprietaire: "owner",
  "propriétaire": "owner"
};

/** Normalise un niveau de permission déclaré par une commande. */
function normalizePermission(value) {
  const key = String(value || "public").trim().toLowerCase();
  return LEVEL_ALIASES[key] || "public";
}

/**
 * @param {object} deps
 * @param {() => object} deps.getConfig           configuration courante
 * @param {() => object|null} deps.getApi         API FCA (null avant connexion)
 * @param {object} [deps.logger]
 * @param {(userID: string) => string} [deps.getUserRole] rôle stocké d'un utilisateur
 */
function createPermissions(deps = {}) {
  const getConfig = typeof deps.getConfig === "function" ? deps.getConfig : () => ({});
  const getApi = typeof deps.getApi === "function" ? deps.getApi : () => null;
  const getUserRole = typeof deps.getUserRole === "function" ? deps.getUserRole : () => "user";
  const logger = deps.logger || { warn() {}, error() {}, info() {}, debug() {} };

  /** UID du propriétaire. */
  function getOwnerUID() {
    const config = getConfig() || {};
    return normalizeUID(config.owner && config.owner.uid);
  }

  /**
   * Rôle d'un utilisateur, hors contexte de groupe.
   * @param {string|number} userID
   * @returns {"owner"|"admin"|"user"}
   */
  function roleOf(userID) {
    const uid = normalizeUID(userID);
    if (!uid) return "user";
    if (uid === getOwnerUID()) return "owner";
    const stored = String(getUserRole(uid) || "user").toLowerCase();
    return stored === "admin" ? "admin" : "user";
  }

  function isOwner(userID) {
    return roleOf(userID) === "owner";
  }

  function isAdmin(userID) {
    const role = roleOf(userID);
    return role === "admin" || role === "owner";
  }

  /** Compatibilité avec l'ancienne API (ADMIN_UID). */
  function getAdminUIDs() {
    const list = [];
    const owner = getOwnerUID();
    if (owner) list.push(owner);
    return list;
  }

  /**
   * L'utilisateur est-il administrateur DU GROUPE courant ?
   *
   * @param {string|number} userID
   * @param {string[]|number[]} [groupAdminIDs] admins renvoyés par Facebook
   */
  function isGroupAdmin(userID, groupAdminIDs) {
    const uid = normalizeUID(userID);
    if (!uid) return false;
    if (isAdmin(uid)) return true;
    const list = Array.isArray(groupAdminIDs) ? groupAdminIDs : [];
    return list.some((id) => normalizeUID(id) === uid);
  }

  /**
   * Vérifie si une commande peut être exécutée.
   *
   * @param {object} command  descripteur de commande
   * @param {object} ctx      contexte Messenger
   * @param {{ groupAdminIDs?: string[], isGroup?: boolean }} [context]
   * @returns {{ allowed: boolean, level: string, reason?: string }}
   */
  function canExecute(command, ctx, context = {}) {
    const level = normalizePermission(command && command.permissions);
    const senderID = ctx && ctx.senderID ? String(ctx.senderID) : "";
    const groupAdminIDs = Array.isArray(context.groupAdminIDs) ? context.groupAdminIDs : [];

    if (level === "public") return { allowed: true, level };
    if (!senderID) return { allowed: false, level, reason: "Expéditeur inconnu." };

    if (level === "groupadmin") {
      if (isGroupAdmin(senderID, groupAdminIDs)) return { allowed: true, level };
      return {
        allowed: false,
        level,
        reason: "Cette commande est réservée aux administrateurs du groupe."
      };
    }

    if (level === "admin") {
      if (isAdmin(senderID)) return { allowed: true, level };
      return { allowed: false, level, reason: "Cette commande est réservée aux administrateurs." };
    }

    if (level === "owner") {
      if (isOwner(senderID)) return { allowed: true, level };
      return { allowed: false, level, reason: "Cette commande est réservée au propriétaire du bot." };
    }

    return { allowed: true, level };
  }

  /**
   * Refuse proprement une commande non autorisée (message + log).
   * @returns {Promise<boolean>} true si le refus a pu être envoyé
   */
  async function deny(ctx, message) {
    const text =
      message ||
      "⛔ Accès refusé. Cette commande est réservée aux administrateurs.";
    const senderID = ctx && ctx.senderID ? String(ctx.senderID) : "inconnu";
    const threadID = ctx && ctx.threadID ? String(ctx.threadID) : "inconnu";
    logger.warn(`Accès refusé — utilisateur ${senderID} (thread ${threadID}).`, "permissions");
    return safeReply(ctx, text, { logger });
  }

  /**
   * Envoie un message privé au propriétaire.
   * N'échoue jamais bruyamment : retourne `true` / `false`.
   *
   * @param {string|object} payload
   * @returns {Promise<boolean>}
   */
  async function sendOwnerMessage(payload) {
    const owner = getOwnerUID();
    const api = getApi();

    if (!owner) {
      logger.warn("Notification propriétaire ignorée : aucun OWNER_UID configuré.", "permissions");
      return false;
    }
    if (!api || typeof api.sendMessage !== "function") {
      logger.warn("Notification propriétaire ignorée : API non prête.", "permissions");
      return false;
    }
    if (payload === null || payload === undefined || String(payload).trim() === "") return false;

    try {
      await callApiMethod(api.sendMessage.bind(api), [payload, owner], { timeoutMs: 20000 });
      return true;
    } catch (err) {
      logger.error(
        `Notification propriétaire échouée : ${err && err.message ? err.message : err}`,
        "permissions"
      );
      return false;
    }
  }

  /** Alias historique. */
  const sendAdminMessage = sendOwnerMessage;

  return {
    ROLE_LEVEL,
    ROLE_LABEL,
    getOwnerUID,
    getAdminUIDs,
    roleOf,
    isOwner,
    isAdmin,
    isGroupAdmin,
    canExecute,
    normalizePermission,
    deny,
    sendOwnerMessage,
    sendAdminMessage
  };
}

module.exports = { createPermissions, normalizePermission, ROLE_LEVEL, ROLE_LABEL };
