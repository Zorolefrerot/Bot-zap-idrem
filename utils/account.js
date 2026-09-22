"use strict";

/**
 * utils/account.js
 * ---------------------------------------------------------------------------
 * Lecture et validation du fichier "account.txt" (connexion au compte
 * Facebook). Ce module ne journalise JAMAIS de valeur sensible : seuls le nom
 * des cookies et leur nombre sont exposés.
 *
 * Formats acceptés (dans cet ordre de préférence) :
 *   A. appState  → tableau JSON de cookies [{ "key", "value", "domain", ... }]
 *   B. appState  → objet JSON { "appState": [...] }
 *   C. cookie    → chaîne brute "c_user=...; xs=...; datr=...; fr=...; sb=..."
 *   D. cookie    → objet JSON { "c_user": "...", "xs": "..." }
 *   E. identifiants → lignes "email=..." / "password=..." (déconseillé)
 *
 * Sources testées :
 *   1. $ACCOUNT_FILE (chemin explicite)
 *   2. ./account.txt
 *   3. ./appstate.json (compatibilité avec les exports classiques)
 *   4. $FB_APPSTATE / $FB_COOKIE
 *   5. $FB_EMAIL + $FB_PASSWORD
 * ---------------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

/** Erreur explicite liée au compte Facebook. */
class AccountError extends Error {
  constructor(message, code = "ACCOUNT_ERROR") {
    super(message);
    this.name = "AccountError";
    this.code = code;
  }
}

const REQUIRED_COOKIES = ["c_user", "xs"];
const USEFUL_COOKIES = ["c_user", "xs", "datr", "fr", "sb"];

/** Valeurs manifestement laissées telles quelles depuis un fichier d'exemple. */
const PLACEHOLDER_RE = /(remplacez|replace_?me|change_?me|votre_|votre |xxxx|todo|example\.com|<[^>]{1,40}>)/i;

const HINT_MISSING_FILE = [
  "Le fichier de compte est introuvable.",
  "→ Copiez le modèle :  cp account.example.txt account.txt",
  "→ Puis collez vos cookies Facebook dans account.txt.",
  "→ Sur Render, utilisez plutôt la variable d'environnement FB_APPSTATE",
  "   (le disque est éphémère) ou la fonctionnalité « Secret Files ».",
  "→ Détails complets dans README.md, section « Remplir account.txt »."
].join("\n   ");

// ---------------------------------------------------------------------------
// Helpers de parsing
// ---------------------------------------------------------------------------

/** Retire le BOM UTF-8 éventuel. */
function stripBom(text) {
  return String(text ?? "").replace(/^\uFEFF/, "");
}

/** Retire les lignes de commentaire (# ou //) en début de ligne. */
function stripLineComments(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !/^\s*(#|\/\/)/.test(line))
    .join("\n");
}

/**
 * Tente un JSON.parse : d'abord strict, puis en retirant les lignes de
 * commentaire (pratique quand l'utilisateur annote son fichier).
 */
function tryParseJson(text) {
  const raw = stripBom(text).trim();
  if (!raw) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    /* on tente la version sans commentaires */
  }
  const cleaned = stripLineComments(raw).trim();
  if (!cleaned || cleaned === raw) return undefined;
  try {
    return JSON.parse(cleaned);
  } catch {
    return undefined;
  }
}

/** Parse des lignes "clé=valeur". */
function parseKeyValueLines(text) {
  const out = {};
  for (const line of stripLineComments(stripBom(text)).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) out[key] = value;
  }
  return out;
}

function hasPlaceholders(values) {
  return values.some((v) => typeof v === "string" && PLACEHOLDER_RE.test(v));
}

/** Normalise un tableau de cookies au format attendu par la librairie. */
function normalizeAppState(list, origin) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new AccountError(
      `${origin} : appState doit être un tableau JSON non vide de cookies.`,
      "ACCOUNT_INVALID_APPSTATE"
    );
  }

  const appState = [];
  const names = [];

  for (const [index, entry] of list.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AccountError(
        `${origin} : l'entrée n°${index + 1} du tableau de cookies n'est pas un objet JSON.`,
        "ACCOUNT_INVALID_APPSTATE"
      );
    }
    const key = entry.key ?? entry.name ?? entry.cookieName;
    const value = entry.value ?? entry.cookieValue;

    if (typeof key !== "string" || !key.trim()) {
      throw new AccountError(
        `${origin} : l'entrée n°${index + 1} n'a pas de champ "key" (ou "name").`,
        "ACCOUNT_INVALID_APPSTATE"
      );
    }
    if (typeof value !== "string" || !value.trim()) {
      throw new AccountError(
        `${origin} : le cookie "${key.trim()}" n'a pas de "value" valide.`,
        "ACCOUNT_INVALID_APPSTATE"
      );
    }
    if (PLACEHOLDER_RE.test(value)) {
      throw new AccountError(
        `${origin} : le cookie "${key.trim()}" contient encore une valeur d'exemple (${value.slice(0, 12)}…). ` +
          `Remplacez-la par la vraie valeur.`,
        "ACCOUNT_PLACEHOLDER"
      );
    }

    const cookie = {
      key: key.trim(),
      value,
      domain: typeof entry.domain === "string" && entry.domain ? entry.domain : ".facebook.com",
      path: typeof entry.path === "string" && entry.path ? entry.path : "/"
    };
    if (entry.expires !== undefined && entry.expires !== null) cookie.expires = entry.expires;
    if (entry.expirationDate !== undefined && entry.expirationDate !== null) cookie.expires = entry.expirationDate;
    if (typeof entry.httpOnly === "boolean") cookie.httpOnly = entry.httpOnly;
    if (typeof entry.secure === "boolean") cookie.secure = entry.secure;
    if (typeof entry.sameSite === "string") cookie.sameSite = entry.sameSite;

    appState.push(cookie);
    names.push(cookie.key.toLowerCase());
  }

  return { appState, names };
}

/** Vérifie la présence des cookies indispensables et renvoie un rapport. */
function validateCookieNames(names, origin) {
  const lower = names.map((n) => String(n).toLowerCase());
  const missing = REQUIRED_COOKIES.filter((c) => !lower.includes(c));

  if (missing.length) {
    throw new AccountError(
      `${origin} : cookie(s) obligatoire(s) manquant(s) → ${missing.join(", ")}. ` +
        `Cookies détectés : ${lower.length ? lower.join(", ") : "aucun"}. ` +
        `Exportez la totalité des cookies de facebook.com (c_user, xs, datr, fr, sb…).`,
      "ACCOUNT_MISSING_COOKIES"
    );
  }

  const recommended = USEFUL_COOKIES.filter((c) => !lower.includes(c));
  return {
    cookieCount: lower.length,
    cookieNames: lower,
    missingRecommended: recommended
  };
}

/**
 * Construit les credentials à partir d'une chaîne de cookies brute.
 *
 * Accepte indifféremment une seule ligne ("a=1; b=2") ou plusieurs lignes
 * ("a=1\nb=2"), avec ou sans préfixe "Cookie:", points-virgules finaux, etc.
 */
function fromCookieString(cookieString, origin) {
  const text = stripLineComments(stripBom(cookieString))
    .replace(/^\s*cookie\s*:\s*/gim, "") // en-tête HTTP éventuel
    .trim();

  // Les séparateurs reconnus sont le point-virgule ET le saut de ligne.
  const pairs = text
    .split(/[;\r\n]+/)
    .map((pair) => pair.trim())
    .filter(Boolean);

  if (!pairs.length) {
    throw new AccountError(`${origin} : la chaîne de cookies est vide.`, "ACCOUNT_EMPTY");
  }

  /** @type {Map<string, string>} */
  const jar = new Map();

  for (const [position, pair] of pairs.entries()) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      // On n'affiche PAS le contenu : il pourrait s'agir d'une valeur de cookie.
      throw new AccountError(
        `${origin} : l'élément n°${position + 1} n'est pas au format "cle=valeur". ` +
          `Vérifiez la chaîne de cookies (séparateurs ";" ou sauts de ligne).`,
        "ACCOUNT_INVALID_COOKIE"
      );
    }
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();

    if (!key) {
      throw new AccountError(`${origin} : l'élément n°${position + 1} a un nom de cookie vide.`, "ACCOUNT_INVALID_COOKIE");
    }
    if (!value) {
      throw new AccountError(`${origin} : le cookie "${key}" n'a pas de valeur.`, "ACCOUNT_INVALID_COOKIE");
    }
    if (PLACEHOLDER_RE.test(value)) {
      throw new AccountError(
        `${origin} : le cookie "${key}" contient encore une valeur d'exemple (${value.slice(0, 12)}…). ` +
          `Remplacez-la par la vraie valeur.`,
        "ACCOUNT_PLACEHOLDER"
      );
    }
    jar.set(key, value);
  }

  const names = [...jar.keys()].map((k) => k.toLowerCase());
  const report = validateCookieNames(names, origin);
  const header = [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");

  return {
    strategy: "cookie",
    credentials: { Cookie: header },
    info: report
  };
}

/** Construit les credentials à partir d'un tableau appState. */
function fromAppStateList(list, origin) {
  const { appState, names } = normalizeAppState(list, origin);
  const report = validateCookieNames(names, origin);
  return {
    strategy: "appState",
    credentials: { appState },
    info: report
  };
}

/** Construit les credentials à partir d'un objet JSON. */
function fromJsonObject(obj, origin) {
  if (Array.isArray(obj.appState)) return fromAppStateList(obj.appState, origin);
  if (Array.isArray(obj.cookies)) return fromAppStateList(obj.cookies, origin);

  const cookieField = obj.Cookie ?? obj.cookie ?? obj.cookieString;
  if (typeof cookieField === "string") return fromCookieString(cookieField, origin);
  if (Array.isArray(cookieField)) return fromAppStateList(cookieField, origin);

  const email = obj.email ?? obj.user ?? obj.username;
  const password = obj.password ?? obj.pass;
  if (typeof email === "string" && typeof password === "string" && email && password) {
    return fromCredentials(email, password, obj.twofactor ?? obj["2fa"] ?? null, origin);
  }

  // Objet plat du type { "c_user": "...", "xs": "..." }
  const flatPairs = Object.entries(obj).filter(([k]) => typeof k === "string");
  const cookieLike = flatPairs.filter(([, v]) => typeof v === "string" || typeof v === "number");
  if (cookieLike.length) {
    const header = cookieLike.map(([k, v]) => `${k}=${v}`).join("; ");
    return fromCookieString(header, origin);
  }

  throw new AccountError(
    `${origin} : objet JSON non reconnu. Utilisez un tableau de cookies (appState), ` +
      `un objet { "appState": [...] }, ou une chaîne "c_user=...; xs=...".`,
    "ACCOUNT_INVALID_FORMAT"
  );
}

function fromCredentials(email, password, twofactor, origin) {
  if (!email || !password) {
    throw new AccountError(`${origin} : email et password sont tous les deux requis.`, "ACCOUNT_INVALID_CREDENTIALS");
  }
  if (PLACEHOLDER_RE.test(String(password)) || PLACEHOLDER_RE.test(String(email))) {
    throw new AccountError(`${origin} : les identifiants contiennent encore une valeur d'exemple.`, "ACCOUNT_PLACEHOLDER");
  }
  return {
    strategy: "email+password",
    credentials: twofactor ? { email, password, twofactor } : { email, password },
    info: { cookieCount: 0, cookieNames: [], missingRecommended: [] }
  };
}

/** Interprète le contenu texte d'un fichier de compte. */
function parseAccountContent(content, origin) {
  const text = stripBom(content);

  if (!text.trim()) {
    throw new AccountError(`${origin} : le fichier est vide.`, "ACCOUNT_EMPTY");
  }

  const json = tryParseJson(text);
  if (json !== undefined) {
    if (Array.isArray(json)) return fromAppStateList(json, origin);
    if (json && typeof json === "object") return fromJsonObject(json, origin);
    throw new AccountError(`${origin} : JSON valide mais de type inattendu (${typeof json}).`, "ACCOUNT_INVALID_FORMAT");
  }

  // Format "clé=valeur" ?
  const kv = parseKeyValueLines(text);
  const kvKeys = Object.keys(kv);
  const looksLikeKv = kvKeys.length > 0 && kvKeys.some((k) => ["email", "password", "cookie", "appstate"].includes(k));

  if (looksLikeKv) {
    if (kv.appstate) {
      const inner = tryParseJson(kv.appstate);
      if (Array.isArray(inner)) return fromAppStateList(inner, origin);
      if (inner && typeof inner === "object") return fromJsonObject(inner, origin);
      return fromCookieString(kv.appstate, origin);
    }
    if (kv.cookie) {
      // Une ligne "cookie=…" peut être complétée par d'autres lignes "cle=valeur".
      const RESERVED = new Set(["cookie", "appstate", "email", "password", "pass", "twofactor", "2fa"]);
      const extras = Object.entries(kv)
        .filter(([key]) => !RESERVED.has(key))
        .map(([key, value]) => `${key}=${value}`);
      return fromCookieString([kv.cookie, ...extras].filter(Boolean).join("; "), origin);
    }
    if (kv.email && kv.password) return fromCredentials(kv.email, kv.password, kv.twofactor || null, origin);
    throw new AccountError(
      `${origin} : clés détectées (${kvKeys.join(", ")}) mais informations incomplètes.`,
      "ACCOUNT_INVALID_FORMAT"
    );
  }

  // Reste : chaîne de cookies brute, sur une ou plusieurs lignes ("c_user=…")
  if (/c_user\s*=/i.test(text)) return fromCookieString(text, origin);

  throw new AccountError(
    `${origin} : format non reconnu. Attendu : un tableau JSON de cookies (appState), ` +
      `une chaîne "c_user=...; xs=..." ou des lignes "email=..." / "password=...".`,
    "ACCOUNT_INVALID_FORMAT"
  );
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Charge le compte Facebook.
 *
 * @param {object} [options]
 * @param {string} [options.rootDir]      racine du projet
 * @param {NodeJS.ProcessEnv} [options.env] variables d'environnement
 * @param {object} [options.logger]
 * @returns {{ strategy: string, credentials: object, info: object, source: string }}
 * @throws {AccountError}
 */
function loadAccount(options = {}) {
  const env = options.env || process.env;
  const rootDir = options.rootDir || process.cwd();
  const logger = options.logger;

  // 1) Chemin explicite via ACCOUNT_FILE
  if (env.ACCOUNT_FILE && String(env.ACCOUNT_FILE).trim()) {
    const explicit = path.resolve(rootDir, String(env.ACCOUNT_FILE).trim());
    if (!fs.existsSync(explicit)) {
      throw new AccountError(
        `ACCOUNT_FILE pointe vers un fichier inexistant : ${explicit}\n   ${HINT_MISSING_FILE}`,
        "ACCOUNT_FILE_NOT_FOUND"
      );
    }
    const result = parseAccountContent(fs.readFileSync(explicit, "utf8"), `ACCOUNT_FILE (${path.basename(explicit)})`);
    return { ...result, source: `ACCOUNT_FILE (${path.basename(explicit)})` };
  }

  // 2) account.txt à la racine
  const accountFile = path.join(rootDir, "account.txt");
  if (fs.existsSync(accountFile)) {
    let content;
    try {
      content = fs.readFileSync(accountFile, "utf8");
    } catch (err) {
      throw new AccountError(`Impossible de lire account.txt : ${err && err.message ? err.message : err}`, "ACCOUNT_READ_ERROR");
    }
    const result = parseAccountContent(content, "account.txt");
    return { ...result, source: "account.txt" };
  }

  // 3) appstate.json (compatibilité exports classiques)
  const altFile = path.join(rootDir, "appstate.json");
  if (fs.existsSync(altFile)) {
    const result = parseAccountContent(fs.readFileSync(altFile, "utf8"), "appstate.json");
    return { ...result, source: "appstate.json" };
  }

  // 4) Variables d'environnement (indispensables sur Render)
  if (env.FB_APPSTATE && String(env.FB_APPSTATE).trim()) {
    const result = parseAccountContent(String(env.FB_APPSTATE), "variable FB_APPSTATE");
    return { ...result, source: "env:FB_APPSTATE" };
  }
  if (env.FB_COOKIE && String(env.FB_COOKIE).trim()) {
    const result = fromCookieString(String(env.FB_COOKIE), "variable FB_COOKIE");
    return { ...result, source: "env:FB_COOKIE" };
  }

  // 5) Identifiants (déconseillé)
  if (env.FB_EMAIL && env.FB_PASSWORD) {
    if (logger) {
      logger.warn(
        "Connexion par email/mot de passe : Facebook déclenche souvent des checkpoints. " +
          "Préférez un appState (cookies) dans account.txt ou FB_APPSTATE.",
        "account"
      );
    }
    const result = fromCredentials(String(env.FB_EMAIL), String(env.FB_PASSWORD), env.FB_TWOFACTOR || null, "variables FB_EMAIL/FB_PASSWORD");
    return { ...result, source: "env:FB_EMAIL" };
  }

  // Rien trouvé
  throw new AccountError(HINT_MISSING_FILE, "ACCOUNT_NOT_FOUND");
}

/**
 * Vérifie rapidement un fichier sans lever d'exception : pratique pour le
 * selftest et pour afficher un diagnostic clair.
 *
 * @param {object} [options] mêmes options que loadAccount
 * @returns {{ ok: boolean, source?: string, strategy?: string, info?: object, error?: string, code?: string }}
 */
function checkAccount(options = {}) {
  try {
    const account = loadAccount(options);
    return {
      ok: true,
      source: account.source,
      strategy: account.strategy,
      info: account.info
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AccountError ? err.message : err && err.message ? err.message : String(err),
      code: err && err.code ? err.code : "ACCOUNT_ERROR"
    };
  }
}

module.exports = {
  AccountError,
  loadAccount,
  checkAccount,
  parseAccountContent,
  REQUIRED_COOKIES,
  USEFUL_COOKIES,
  HINT_MISSING_FILE
};
