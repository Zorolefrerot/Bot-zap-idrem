"use strict";

/**
 * utils/helpers.js
 * ---------------------------------------------------------------------------
 * Petites fonctions utilitaires réutilisables (aucune dépendance externe).
 * ---------------------------------------------------------------------------
 */

/** Attends `ms` millisecondes. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

/** Vérifie qu'une valeur est une chaîne non vide (après trim). */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** Normalise un UID Facebook en chaîne de chiffres. Retourne "" si invalide. */
function normalizeUID(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  return /^\d{5,25}$/.test(str) ? str : "";
}

/** Formate une durée en millisecondes en texte lisible (français). */
function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const days = Math.floor(total / 86400000);
  const hours = Math.floor((total % 86400000) / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);

  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!days && !hours) parts.push(`${seconds}s`);
  return parts.join(" ");
}

/** Tronque proprement un texte long. */
function truncate(text, max = 500) {
  const str = String(text ?? "");
  if (str.length <= max) return str;
  return `${str.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Découpe un texte trop long en morceaux sûrs pour Messenger.
 * Les coupures privilégient les fins de ligne, puis les espaces.
 *
 * @param {string} text
 * @param {number} [max=4000]
 * @returns {string[]}
 */
function chunkMessage(text, max = 4000) {
  const str = String(text ?? "");
  if (str.length <= max) return [str];

  const chunks = [];
  let rest = str;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < Math.floor(max * 0.5)) cut = rest.lastIndexOf(" ", max);
    if (cut < Math.floor(max * 0.5)) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length) chunks.push(rest);
  return chunks;
}

/**
 * Retire le jeton de commande (préfixe + nom) du début d'un message et
 * retourne les arguments.
 *
 * @param {string} text   texte complet (ex. "/ping hello world")
 * @param {string} token  jeton à retirer (ex. "/ping")
 * @returns {string}       reste du message (ex. "hello world")
 */
function extractArgString(text, token) {
  const str = String(text ?? "");
  const tok = String(token ?? "");
  if (!tok) return str.trim();
  if (str.slice(0, tok.length).toLowerCase() === tok.toLowerCase()) {
    return str.slice(tok.length).trim();
  }
  return str.trim();
}

/**
 * Découpe une chaîne d'arguments en respectant les guillemets doubles.
 * `/admin say "bonjour tout le monde" vite` → ["bonjour tout le monde", "vite"]
 *
 * @param {string} argString
 * @returns {string[]}
 */
function tokenizeArgs(argString) {
  const input = String(argString ?? "").trim();
  if (!input) return [];

  const tokens = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Mémoire des messages déjà traités : évite les réponses en double si
 * Facebook renvoie deux fois le même événement (ou le même messageID).
 *
 * @param {{ ttlMs?: number, max?: number }} [options]
 */
function createDedupeStore(options = {}) {
  const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : 300000;
  const max = Number(options.max) > 0 ? Number(options.max) : 5000;
  /** @type {Map<string, number>} */
  const seen = new Map();
  let lastSweep = Date.now();

  function sweep(now) {
    if (now - lastSweep < ttlMs) return;
    lastSweep = now;
    for (const [key, expiry] of seen) {
      if (expiry <= now) seen.delete(key);
    }
    while (seen.size > max) {
      const oldest = seen.keys().next().value;
      if (oldest === undefined) break;
      seen.delete(oldest);
    }
  }

  return {
    /**
     * @param {string} id
     * @returns {boolean} true si l'ID a déjà été vu (donc à ignorer)
     */
    isDuplicate(id) {
      if (!isNonEmptyString(id)) return false;
      const now = Date.now();
      sweep(now);
      const expiry = seen.get(id);
      if (expiry !== undefined && expiry > now) return true;
      seen.set(id, now + ttlMs);
      return false;
    },
    get size() {
      return seen.size;
    },
    clear() {
      seen.clear();
    }
  };
}

/**
 * Gestion simple de cooldown par utilisateur et par commande.
 *
 * @param {{ ttlMs?: number }} [options]
 */
function createCooldownStore(options = {}) {
  const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : 600000;
  /** @type {Map<string, number>} */
  const lastRun = new Map();
  let lastSweep = Date.now();

  return {
    /**
     * @param {string} key
     * @param {number} cooldownSeconds
     * @returns {{ ok: boolean, remaining: number }}
     */
    consume(key, cooldownSeconds) {
      const cooldownMs = Math.max(0, Number(cooldownSeconds) || 0) * 1000;
      const now = Date.now();

      if (now - lastSweep > ttlMs) {
        lastSweep = now;
        for (const [k, expiry] of lastRun) {
          if (expiry <= now) lastRun.delete(k);
        }
      }
      if (cooldownMs <= 0) return { ok: true, remaining: 0 };

      const expiry = lastRun.get(key) || 0;
      if (expiry > now) {
        return { ok: false, remaining: Math.ceil((expiry - now) / 1000) };
      }
      lastRun.set(key, now + cooldownMs);
      return { ok: true, remaining: 0 };
    }
  };
}

/**
 * Envoie une réponse sans jamais faire planter l'appelant.
 *
 * @param {object} ctx      MessengerContext
 * @param {string} payload
 * @param {{ logger?: object, maxChunk?: number }} [options]
 * @returns {Promise<boolean>} true si l'envoi a réussi
 */
async function safeReply(ctx, payload, options = {}) {
  const logger = options.logger;
  const maxChunk = Number(options.maxChunk) > 0 ? Number(options.maxChunk) : 4000;
  const text = String(payload ?? "");
  if (!text.trim()) return false;

  const chunks = chunkMessage(text, maxChunk);
  for (const chunk of chunks) {
    try {
      await ctx.replyAsync(chunk);
    } catch (err) {
      if (logger) logger.error(`Échec d'envoi de la réponse : ${err && err.message ? err.message : err}`);
      return false;
    }
  }
  return true;
}

/**
 * Réessaie une fonction asynchrone avec délai croissant.
 *
 * @param {() => Promise<any>} fn
 * @param {{ attempts?: number, delayMs?: number, onRetry?: Function, logger?: object }} [options]
 */
async function retry(fn, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  let lastError;

  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn(i);
    } catch (err) {
      lastError = err;
      if (typeof options.onRetry === "function") {
        try {
          options.onRetry(err, i, attempts);
        } catch {
          /* ignoré */
        }
      }
      if (i < attempts && delayMs) await sleep(delayMs * i);
    }
  }
  throw lastError;
}

/**
 * Appelle une méthode de l'API FCA de façon uniforme.
 *
 * La librairie accepte soit un callback final `(err, result)`, soit retourne
 * une Promise. Cette fonction gère les deux cas, protège contre un double
 * règlement et applique un délai maximal pour ne jamais bloquer le bot.
 *
 * @param {Function} fn        méthode liée à `api` (ex. `api.sendMessage.bind(api)`)
 * @param {any[]} args         arguments sans callback
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<any>}
 */
function callApiMethod(fn, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 20000;

  return new Promise((resolve, reject) => {
    if (typeof fn !== "function") {
      reject(new Error("méthode API indisponible"));
      return;
    }

    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => finish(new Error(`délai dépassé (${timeoutMs} ms)`)), timeoutMs);

    let returned;
    try {
      returned = fn(...args, (err, value) => finish(err || null, value));
    } catch (err) {
      finish(err);
      return;
    }

    if (returned && typeof returned.then === "function") {
      returned.then((value) => finish(null, value), (err) => finish(err));
    }
  });
}

/** Distance de Levenshtein (petites chaînes uniquement). */
function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  let previous = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= t.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[t.length];
}

/**
 * Cherche le candidat le plus proche d'une saisie (utile pour « vouliez-vous
 * dire … ? »). Un candidat qui commence par la saisie est toujours prioritaire.
 *
 * @param {string} input
 * @param {string[]} candidates
 * @param {number} [maxDistance=3]
 * @returns {string|null}
 */
function closestMatch(input, candidates, maxDistance = 3) {
  const value = String(input || "").trim().toLowerCase();
  const list = Array.isArray(candidates) ? candidates.filter(Boolean).map((c) => String(c).toLowerCase()) : [];
  if (!value || !list.length) return null;
  if (list.includes(value)) return value;

  const startsWith = list.find((c) => c.startsWith(value));
  if (startsWith) return startsWith;

  let best = null;
  let bestDistance = Infinity;
  for (const candidate of list) {
    const distance = levenshtein(value, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  const limit = Math.max(1, Number(maxDistance) || 3);
  return bestDistance <= limit ? best : null;
}

/** Horodatage ISO court, pour les messages d'état. */
function nowLabel() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

module.exports = {
  sleep,
  isNonEmptyString,
  normalizeUID,
  formatDuration,
  truncate,
  chunkMessage,
  extractArgString,
  tokenizeArgs,
  createDedupeStore,
  createCooldownStore,
  safeReply,
  callApiMethod,
  levenshtein,
  closestMatch,
  retry,
  nowLabel
};
