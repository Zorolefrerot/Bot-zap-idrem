"use strict";

/**
 * services/users.js
 * ---------------------------------------------------------------------------
 * Profils utilisateurs (data/users.json).
 *
 * Chaque utilisateur possède : userID, name, level, xp, coins (voir
 * services/economy.js), messages, commandsUsed, role, joinedAt, lastActivity.
 *
 * Règles de sécurité :
 *   • seul le PROPRIÉTAIRE peut promouvoir/déstabiliser un administrateur ;
 *   • personne ne peut s'attribuer un rôle à lui-même ;
 *   • le rôle "owner" n'est jamais stocké : il découle de config.owner.uid.
 * ---------------------------------------------------------------------------
 */

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

const VALID_ROLES = ["user", "admin"];

function now() {
  return Date.now();
}

function uid(value) {
  const str = String(value ?? "").trim();
  return /^\d{5,25}$/.test(str) ? str : "";
}

/**
 * @param {object} deps
 * @param {object} deps.store     gestionnaire de collections (services/store.js)
 * @param {object} deps.config    configuration chargée
 * @param {object} [deps.logger]
 * @param {object} [deps.permissions] pour connaître le propriétaire
 */
function createUsers(deps = {}) {
  const { store, config } = deps;
  const logger = deps.logger || noopLogger;
  const collection = store.get("users", {});

  function defaults(userID) {
    return {
      userID,
      name: "",
      role: "user",
      xp: 0,
      level: 1,
      messages: 0,
      commandsUsed: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      commandCounts: {},
      categoryCounts: {},
      marriedTo: "",
      marriedAt: 0,
      friends: [],
      joinedAt: now(),
      lastActivity: now(),
      lastXpAt: 0
    };
  }

  /** Assure qu'un enregistrement est exploitable même s'il vient d'une vieille version. */
  function repair(record, userID) {
    const base = defaults(userID);
    if (!record || typeof record !== "object" || Array.isArray(record)) return base;
    const merged = { ...base, ...record };
    merged.userID = userID;
    merged.role = VALID_ROLES.includes(String(merged.role).toLowerCase()) ? String(merged.role).toLowerCase() : "user";
    for (const key of ["xp", "level", "messages", "commandsUsed", "gamesPlayed", "gamesWon", "marriedAt", "joinedAt", "lastActivity", "lastXpAt"]) {
      merged[key] = Number.isFinite(Number(merged[key])) ? Math.max(0, Number(merged[key])) : base[key];
    }
    if (!merged.commandCounts || typeof merged.commandCounts !== "object") merged.commandCounts = {};
    if (!merged.categoryCounts || typeof merged.categoryCounts !== "object") merged.categoryCounts = {};
    if (!Array.isArray(merged.friends)) merged.friends = [];
    merged.friends = merged.friends.map((f) => uid(f)).filter(Boolean).slice(0, 200);
    merged.marriedTo = uid(merged.marriedTo);
    return merged;
  }

  /**
   * Profil complet d'un utilisateur (le crée s'il est inconnu).
   * @param {string|number} userID
   */
  function get(userID) {
    const id = uid(userID);
    if (!id) return null;
    const existing = collection.data[id];
    const record = repair(existing, id);
    if (!existing) {
      collection.data[id] = record;
      collection.save();
    } else if (existing !== record) {
      collection.data[id] = record;
    }
    return record;
  }

  /** Lecture sans création (utile pour les classements). */
  function peek(userID) {
    const id = uid(userID);
    return id ? collection.data[id] || null : null;
  }

  /** Met à jour un utilisateur et persiste. */
  function update(userID, patch) {
    const record = get(userID);
    if (!record || !patch || typeof patch !== "object") return record;
    Object.assign(record, patch);
    collection.data[record.userID] = repair(record, record.userID);
    collection.save();
    return collection.data[record.userID];
  }

  function setName(userID, name) {
    const clean = String(name ?? "").trim().slice(0, 80);
    if (!clean) return null;
    return update(userID, { name: clean });
  }

  function getName(userID) {
    const record = peek(userID);
    return record && record.name ? record.name : "";
  }

  function touch(userID) {
    const record = get(userID);
    if (!record) return null;
    record.lastActivity = now();
    collection.save();
    return record;
  }

  function addMessage(userID, amount = 1) {
    const record = get(userID);
    if (!record) return null;
    record.messages = Math.max(0, record.messages + (Number(amount) || 0));
    record.lastActivity = now();
    collection.save();
    return record;
  }

  function addCommand(userID, commandName, category) {
    const record = get(userID);
    if (!record) return null;
    record.commandsUsed += 1;
    record.lastActivity = now();
    if (commandName) {
      const key = String(commandName).toLowerCase();
      record.commandCounts[key] = (record.commandCounts[key] || 0) + 1;
      // On ne conserve que les 60 commandes les plus récentes/utilisées.
      if (Object.keys(record.commandCounts).length > 60) {
        record.commandCounts = Object.fromEntries(
          Object.entries(record.commandCounts).sort((a, b) => b[1] - a[1]).slice(0, 60)
        );
      }
    }
    if (category) {
      record.categoryCounts[category] = (record.categoryCounts[category] || 0) + 1;
    }
    collection.save();
    return record;
  }

  function addGame(userID, won) {
    const record = get(userID);
    if (!record) return null;
    record.gamesPlayed += 1;
    if (won) record.gamesWon += 1;
    collection.save();
    return record;
  }

  /** Nombre d'utilisateurs connus. */
  function count() {
    return Object.keys(collection.data).length;
  }

  /** Tous les profils (tableau). */
  function all() {
    return Object.values(collection.data).map((r) => repair(r, r.userID));
  }

  /**
   * Classement selon un champ numérique.
   * @param {"xp"|"level"|"messages"|"commandsUsed"|"gamesWon"} key
   * @param {number} limit
   */
  function top(key, limit = 10) {
    const field = ["xp", "level", "messages", "commandsUsed", "gamesWon"].includes(key) ? key : "xp";
    return all()
      .sort((a, b) => (b[field] || 0) - (a[field] || 0) || (b.xp || 0) - (a.xp || 0))
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 10)));
  }

  /** Position d'un utilisateur dans un classement (1 = premier). */
  function rank(userID, key = "xp") {
    const field = ["xp", "level", "messages", "commandsUsed", "gamesWon"].includes(key) ? key : "xp";
    const id = uid(userID);
    if (!id) return 0;
    const sorted = all().sort((a, b) => (b[field] || 0) - (a[field] || 0) || (b.xp || 0) - (a.xp || 0));
    const index = sorted.findIndex((u) => u.userID === id);
    return index === -1 ? 0 : index + 1;
  }

  // --- Rôles ---------------------------------------------------------------

  function roleOf(userID) {
    const id = uid(userID);
    if (!id) return "user";
    const ownerUID = uid(config.owner && config.owner.uid);
    if (ownerUID && id === ownerUID) return "owner";
    const record = peek(id);
    return record && VALID_ROLES.includes(String(record.role).toLowerCase())
      ? String(record.role).toLowerCase()
      : "user";
  }

  /** Liste des administrateurs promus (le propriétaire n'y figure pas). */
  function admins() {
    return all().filter((u) => u.role === "admin");
  }

  /**
   * Change le rôle d'un utilisateur.
   *
   * @param {string} targetID
   * @param {"user"|"admin"} role
   * @param {{ by?: string }} [meta] qui effectue le changement
   * @returns {{ ok: boolean, error?: string, role?: string }}
   */
  function setRole(targetID, role, meta = {}) {
    const target = uid(targetID);
    const actor = uid(meta.by);
    const wanted = String(role || "").toLowerCase();

    if (!target) return { ok: false, error: "UID cible invalide." };
    if (!VALID_ROLES.includes(wanted)) return { ok: false, error: `Rôle inconnu : « ${role} ».` };

    const ownerUID = uid(config.owner && config.owner.uid);
    if (target === ownerUID) {
      return { ok: false, error: "Le rôle du propriétaire est fixé par la configuration et ne peut pas être modifié." };
    }
    // Interdiction absolue de s'auto-promouvoir.
    if (actor && actor === target) {
      logger.warn(`Tentative d'auto-promotion refusée (UID ${target}).`, "users");
      return { ok: false, error: "Impossible de modifier votre propre rôle." };
    }
    // Seul le propriétaire peut gérer les administrateurs.
    if (!actor || actor !== ownerUID) {
      logger.warn(`Changement de rôle refusé : acteur ${actor || "inconnu"} non propriétaire.`, "users");
      return { ok: false, error: "Seul le propriétaire du bot peut gérer les rôles." };
    }

    const record = get(target);
    if (!record) return { ok: false, error: "Profil introuvable." };
    record.role = wanted;
    collection.save();
    logger.info(`Rôle de ${target} → ${wanted} (par ${actor}).`, "users");
    return { ok: true, role: wanted };
  }

  /** Supprime un utilisateur (oubli complet : profil, économie, avertissements). */
  function remove(userID) {
    const id = uid(userID);
    if (!id || !(id in collection.data)) return false;
    delete collection.data[id];
    collection.save();
    return true;
  }

  // --- Social --------------------------------------------------------------

  function marry(userA, userB) {
    const a = uid(userA);
    const b = uid(userB);
    if (!a || !b || a === b) return { ok: false, error: "Mariage impossible." };
    const recA = get(a);
    const recB = get(b);
    if (recA.marriedTo) return { ok: false, error: `${recA.name || a} est déjà marié(e).` };
    if (recB.marriedTo) return { ok: false, error: `${recB.name || b} est déjà marié(e).` };
    recA.marriedTo = b;
    recA.marriedAt = now();
    recB.marriedTo = a;
    recB.marriedAt = now();
    collection.save();
    return { ok: true, at: recA.marriedAt };
  }

  function divorce(userID) {
    const a = uid(userID);
    if (!a) return { ok: false, error: "UID invalide." };
    const recA = get(a);
    if (!recA.marriedTo) return { ok: false, error: "Vous n'êtes pas marié(e)." };
    const recB = get(recA.marriedTo);
    const partner = recA.marriedTo;
    recA.marriedTo = "";
    recA.marriedAt = 0;
    if (recB && recB.marriedTo === a) {
      recB.marriedTo = "";
      recB.marriedAt = 0;
    }
    collection.save();
    return { ok: true, partner };
  }

  function addFriend(userID, friendID) {
    const a = uid(userID);
    const b = uid(friendID);
    if (!a || !b) return { ok: false, error: "UID invalide." };
    if (a === b) return { ok: false, error: "Impossible de s'ajouter soi-même." };
    const recA = get(a);
    const recB = get(b);
    if (recA.friends.includes(b)) return { ok: false, error: "Déjà dans votre liste d'amis." };
    recA.friends.push(b);
    if (!recB.friends.includes(a)) recB.friends.push(a);
    collection.save();
    return { ok: true, total: recA.friends.length };
  }

  function removeFriend(userID, friendID) {
    const a = uid(userID);
    const b = uid(friendID);
    if (!a || !b) return { ok: false, error: "UID invalide." };
    const recA = get(a);
    const recB = get(b);
    if (!recA.friends.includes(b)) return { ok: false, error: "Cette personne n'est pas dans votre liste." };
    recA.friends = recA.friends.filter((f) => f !== b);
    if (recB) recB.friends = recB.friends.filter((f) => f !== a);
    collection.save();
    return { ok: true, total: recA.friends.length };
  }

  return {
    VALID_ROLES,
    get,
    peek,
    update,
    setName,
    getName,
    touch,
    addMessage,
    addCommand,
    addGame,
    count,
    all,
    top,
    rank,
    roleOf,
    admins,
    setRole,
    remove,
    marry,
    divorce,
    addFriend,
    removeFriend,
    defaults,
    store: collection
  };
}

module.exports = { createUsers };
