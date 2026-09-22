"use strict";

/**
 * utils/logger.js
 * ---------------------------------------------------------------------------
 * Journalisation console (et optionnellement fichier) + NETTOYAGE des données
 * sensibles. Aucun log ne doit contenir de cookie, mot de passe, token ou
 * session Facebook : tout passe par `sanitize()` avant d'être affiché.
 * ---------------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024; // rotation simple à 5 Mo

const REDACTED = "***REDACTED***";

/**
 * Clés dont la VALEUR ne doit jamais apparaître dans un log.
 * (cookies Facebook, identifiants, tokens, secrets divers)
 */
const SENSITIVE_KEYS = [
  // cookies de session Facebook
  "xs",
  "datr",
  "fr",
  "sb",
  "c_user",
  "cuser",
  "wd",
  "vpd",
  "ps_n",
  "ps_l",
  "rur",
  "spin",
  "locale",
  "presence",
  "_js_datr",
  "m_pixel_ratio",
  "x-referer",
  "lsd",
  "jazoest",
  "fb_dtsg",
  "fb_dtsg_ag",
  "nh",
  "usida",
  // identifiants / secrets génériques
  "pass",
  "passwd",
  "password",
  "pwd",
  "token",
  "access_token",
  "accessToken",
  "secret",
  "client_secret",
  "api_key",
  "apiKey",
  "apikey",
  "authorization",
  "auth",
  "cookie",
  "cookies",
  "set-cookie",
  "appstate",
  "app_state",
  "twofactor",
  "2fa",
  "otp",
  "session",
  "session_id",
  "private_key",
  "privatekey"
];

const SENSITIVE_KEY_SET = new Set(SENSITIVE_KEYS.map((k) => k.toLowerCase()));

/** Motif long sans espace : token/base64/hex isolé → potentiellement sensible. */
const LONG_TOKEN_RE = /[A-Za-z0-9+/_\-]{64,}={0,2}/g;

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Motif ciblé « clé sensible = valeur », tolérant aux guillemets JSON.
 * Nécessaire car une règle générique `clé=valeur` peut être « mangée » par un
 * mot précédent (ex. `login: xs=SECRET` → la clé détectée serait `login`).
 */
const SENSITIVE_PAIR_RE = new RegExp(
  `\\b(${SENSITIVE_KEYS.slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeForRegex)
    .join("|")})(["']?\\s*[:=]\\s*["']?)([^\\s,;}"'&]+)`,
  "gi"
);

function isSensitiveKey(key) {
  if (typeof key !== "string") return false;
  const k = key.trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (!k) return false;
  if (SENSITIVE_KEY_SET.has(k)) return true;
  // tolère les variantes : "fb_cookie", "user_password", "xs.token", "cookie-2"…
  return SENSITIVE_KEYS.some(
    (s) =>
      k.endsWith(`_${s}`) ||
      k.endsWith(`-${s}`) ||
      k.endsWith(`.${s}`) ||
      k.startsWith(`${s}_`) ||
      k.startsWith(`${s}-`) ||
      k.startsWith(`${s}.`)
  );
}

/**
 * Nettoie une chaîne : masque les valeurs sensibles (JSON, paires clé=valeur,
 * en-têtes HTTP et jetons très longs).
 *
 * @param {unknown} input
 * @returns {string}
 */
function sanitize(input) {
  if (input === null || input === undefined) return "";
  let text;
  if (typeof input === "string") {
    text = input;
  } else if (input instanceof Error) {
    text = formatError(input);
  } else {
    try {
      text = JSON.stringify(redactObject(input));
    } catch {
      text = String(input);
    }
  }

  // 1) appState : {"key":"xs", "value":"…"} → valeur masquée (les deux ordres)
  text = text.replace(
    /("(?:key|name|cookieName)"\s*:\s*")([^"]{1,64})("\s*,?\s*"(?:value|cookieValue)"\s*:\s*")([^"]*)(")/gi,
    (match, pre, cookieName, mid, value, post) =>
      isSensitiveKey(cookieName) ? `${pre}${cookieName}${mid}${REDACTED}${post}` : match
  );
  text = text.replace(
    /("(?:value|cookieValue)"\s*:\s*")([^"]*)("\s*,?\s*"(?:key|name|cookieName)"\s*:\s*")([^"]{1,64})(")/gi,
    (match, pre, value, mid, cookieName, post) =>
      isSensitiveKey(cookieName) ? `${pre}${REDACTED}${mid}${cookieName}${post}` : match
  );

  // 2) ciblé : toute « clé sensible = valeur », y compris en JSON
  text = text.replace(SENSITIVE_PAIR_RE, (match, key, sep) => `${key}${sep}${REDACTED}`);

  // 3) JSON générique : "maCle":"valeur" → masqué si la clé est sensible
  text = text.replace(/(["'])([^"'\\\n]{1,64})\1\s*:\s*(["'])(?:[^"'\\]|\\.)*\3/gi, (match, q1, key, q3) => {
    return isSensitiveKey(key) ? `${q1}${key}${q1}:${q3}${REDACTED}${q3}` : match;
  });

  // 4) paires clé=valeur : xs=abc;  password: abc  →  masquées
  text = text.replace(/([A-Za-z0-9_.\-]{2,64})\s*([=:])\s*("[^"]*"|'[^']*'|[^\s,;}&]+)/g, (match, key, sep, value) => {
    if (!isSensitiveKey(key)) return match;
    return `${key}${sep}${REDACTED}`;
  });

  // 5) filet de sécurité : tout jeton très long (>= 64 caractères) est masqué
  text = text.replace(LONG_TOKEN_RE, (token) => `${REDACTED}(len:${token.length})`);

  return text;
}

/**
 * Copie profonde d'un objet avec masquage des clés sensibles.
 * Utile pour journaliser une configuration ou un objet de credentials.
 *
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
function redactObject(value, depth = 0) {
  if (depth > 6) return "[profondeur maximale atteinte]";
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && value.length >= 64 && LONG_TOKEN_RE.test(value)) {
      LONG_TOKEN_RE.lastIndex = 0;
      return `${REDACTED}(len:${value.length})`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item, depth + 1));
  }
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactObject(val, depth + 1);
  }
  return out;
}

/**
 * Transforme une erreur en texte lisible (message + cause), sans stack à ce
 * stade — `sanitize()` s'occupe ensuite du masquage.
 *
 * @param {unknown} err
 * @returns {string}
 */
function formatError(err) {
  if (!err) return "erreur inconnue";
  if (typeof err === "string") return err;

  const parts = [];
  const message = err.message || err.error_description || err.error || String(err);
  parts.push(String(message));

  if (err.cause) {
    const cause = err.cause instanceof Error ? err.cause.message : String(err.cause);
    parts.push(`cause: ${cause}`);
  }
  if (typeof err.code === "string" && err.code) parts.push(`code: ${err.code}`);
  if (err.status || err.statusCode) parts.push(`statut: ${err.status || err.statusCode}`);
  if (err.stack) {
    const firstFrames = String(err.stack)
      .split("\n")
      .slice(1, 4)
      .map((l) => l.trim())
      .filter(Boolean);
    if (firstFrames.length) parts.push(firstFrames.join(" | "));
  }
  return parts.join(" — ");
}

function normalizeLevel(level) {
  const key = String(level || "info").toLowerCase();
  return key in LEVELS ? key : "info";
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function colorize(text, code, enabled) {
  return enabled ? `\x1b[${code}m${text}\x1b[0m` : text;
}

const COLORS = {
  error: "31",
  warn: "33",
  info: "36",
  success: "32",
  debug: "90",
  tag: "90"
};

/**
 * Crée un logger.
 *
 * @param {{ level?: string, file?: string|null, colors?: boolean, sinks?: Array<(entry: object) => void> }} [options]
 *   `sinks` : fonctions appelées pour chaque ligne retenue (utilisé par
 *   services/logs.js pour alimenter le journal consultable via /logs).
 */
function createLogger(options = {}) {
  const sinks = Array.isArray(options.sinks) ? options.sinks.filter((fn) => typeof fn === "function") : [];
  const level = normalizeLevel(options.level);
  const numeric = LEVELS[level];
  const useColor =
    options.colors !== undefined
      ? Boolean(options.colors)
      : Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

  let filePath = options.file ? path.resolve(String(options.file)) : null;
  if (filePath) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    } catch {
      filePath = null; // le fichier journal n'est jamais bloquant
    }
  }

  function writeToFile(line) {
    if (!filePath) return;
    try {
      const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      if (stat && stat.size > MAX_LOG_FILE_BYTES) {
        fs.renameSync(filePath, `${filePath}.1`);
      }
      fs.appendFileSync(filePath, `${line}\n`);
    } catch {
      /* silencieux : un souci de log fichier ne doit jamais casser le bot */
    }
  }

  function log(kind, message, tag) {
    if (LEVELS[kind] > numeric) return;
    const label = kind === "success" ? "info" : kind;
    const prefix = tag ? `${label}/${tag}` : label;
    const cleaned = sanitize(message);
    const stamp = timestamp();

    const plain = `[${stamp}] [${prefix.toUpperCase()}] ${cleaned}`;
    const colored = `${colorize(`[${stamp}]`, COLORS.tag, useColor)} ${colorize(
      `[${prefix.toUpperCase()}]`.padEnd(9),
      COLORS[kind] || COLORS.info,
      useColor
    )} ${cleaned}`;

    if (kind === "error" || kind === "warn") {
      process.stderr.write(`${colored}\n`);
    } else {
      process.stdout.write(`${colored}\n`);
    }
    writeToFile(plain);

    for (const sink of sinks) {
      try {
        sink({ at: Date.now(), level: label, scope: String(tag || ""), message: cleaned });
      } catch {
        /* un sink défaillant ne doit jamais casser la journalisation */
      }
    }
  }

  const logger = {
    level,
    silent: numeric === 0,
    debug: (msg, tag) => log("debug", msg, tag),
    info: (msg, tag) => log("info", msg, tag),
    warn: (msg, tag) => log("warn", msg, tag),
    error: (msg, tag) => log("error", msg, tag),
    success: (msg, tag) => log("success", msg, tag),
    /** Bannière de démarrage (toujours affichée, sauf niveau silent). */
    banner(lines) {
      if (numeric === 0) return;
      const text = Array.isArray(lines) ? lines.join("\n") : String(lines);
      process.stdout.write(`${colorize(text, "36", useColor)}\n`);
      writeToFile(text);
    },
    sanitize,
    redactObject,
    formatError,
    /** Ajoute un destinataire de logs à chaud (services/logs.js). */
    addSink(fn) {
      if (typeof fn === "function" && !sinks.includes(fn)) sinks.push(fn);
      return logger;
    }
  };

  return logger;
}

module.exports = {
  createLogger,
  sanitize,
  redactObject,
  formatError,
  isSensitiveKey,
  LEVELS
};
