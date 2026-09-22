"use strict";

/**
 * utils/config.js
 * ---------------------------------------------------------------------------
 * Configuration centralisée d'IDREM TERESHKOVA.
 *
 *   config.json      → identité, préfixe, économie, XP, limites, conversation…
 *   process.env      → overrides (PREFIX, OWNER_UID, DATA_DIR, clés IA…)
 *   fca-config.json  → réglages internes de la librairie (gérés ici)
 *
 * Principe : les valeurs par défaut sont intégrées au module. Même avec un
 * config.json absent ou corrompu, le bot démarre avec une configuration saine.
 * Aucun secret n'est stocké dans config.json : les clés API viennent de
 * l'environnement uniquement.
 * ---------------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

const DEFAULTS = {
  identity: {
    name: "IDREM TERESHKOVA",
    short: "IDREM",
    version: "2.0.0",
    tagline: "Système modulaire • Facebook Messenger",
    palette: { primary: "🔵", dark: "⚫", light: "⚪", accent: "⚡" },
    mentionAliases: ["idrem", "tereshkova", "idrem tereshkova", "idrembot"]
  },
  prefix: "/",
  language: "fr",
  owner: { uid: "", label: "Propriétaire" },
  currency: { name: "IDREM Coins", symbol: "IG", startBalance: 500, maxBalance: 1000000000 },
  xp: { base: 100, factor: 1.5, perMessage: 1, perCommand: 2, messageIntervalMs: 60000, maxLevel: 200 },
  limits: {
    defaultCooldownSeconds: 3,
    globalCooldownMs: 900,
    floodMessages: 6,
    floodWindowMs: 6000,
    floodMuteMs: 60000,
    maxMessageLength: 4000,
    dedupeTtlMs: 300000,
    maxWarns: 3,
    maxInventorySlots: 40
  },
  conversation: {
    enabled: true,
    probability: 0.5,
    groupProbability: 0.25,
    threadCooldownMs: 45000,
    userCooldownMs: 90000,
    mentionAlwaysReplies: true,
    minTextLength: 2,
    ignoreBots: true
  },
  economy: {
    daily: { cooldownHours: 20, min: 150, max: 600 },
    work: { cooldownMinutes: 45, min: 80, max: 420 },
    crime: {
      cooldownMinutes: 90,
      successRate: 0.45,
      min: 200,
      max: 900,
      fineMin: 50,
      fineMax: 300
    },
    transferFeePercent: 0
  },
  games: {
    sessionTimeoutMs: 90000,
    xpReward: { win: 12, lose: 3, draw: 6 },
    coinReward: { win: 60, lose: 0, draw: 15 }
  },
  moderation: {
    antilinkDefault: false,
    antispamDefault: true,
    welcomeDefault: false,
    goodbyeDefault: false,
    allowedLinkDomains: ["facebook.com", "messenger.com", "youtu.be", "youtube.com"]
  },
  security: { allowEval: false, logLevel: "info", logRetention: 300 },
  storage: {
    dir: "data",
    flushIntervalMs: 5000,
    snapshotIntervalMs: 300000,
    remote: { url: "", token: "", header: "x-api-key" }
  },
  notifications: { ownerOnReady: true, ownerOnError: true, ownerOnBan: false },
  connection: {
    listenEvents: true,
    selfListen: false,
    selfListenEvent: false,
    listenTyping: false,
    updatePresence: false,
    autoMarkRead: false,
    autoReconnect: true,
    online: true,
    emitReady: true,
    forceLogin: false,
    userAgent: "",
    proxy: "",
    loginRetries: 3,
    loginRetryDelayMs: 10000,
    maxReconnectAttempts: 8
  },
  healthServer: { enabled: true, host: "0.0.0.0", port: null },
  logging: { level: "info", file: null }
};

/** Réglages imposés à la librairie pour un déploiement stable. */
const FCA_SAFE_CONFIG = {
  autoUpdate: false,
  checkUpdate: {
    enabled: false,
    install: false,
    notifyIfCurrent: false,
    packageName: "@dongdev/fca-unofficial",
    registryUrl: "https://registry.npmjs.org",
    timeoutMs: 10000
  },
  mqtt: { enabled: true, reconnectInterval: 3600 },
  autoLogin: false,
  antiGetInfo: { AntiGetThreadInfo: true, AntiGetUserInfo: true },
  remoteControl: { enabled: false, url: "", token: "", autoReconnect: true },
  threadCache: { maxAgeMs: 900000, invalidateIntervalMs: 900000 }
};

const VALID_LOG_LEVELS = ["silent", "error", "warn", "info", "debug"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(out[key])) out[key] = deepMerge(out[key], value);
    else if (value !== undefined) out[key] = value;
  }
  return out;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, data: null };
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    if (!raw.trim()) return { exists: true, data: null, empty: true };
    return { exists: true, data: JSON.parse(raw) };
  } catch (err) {
    return { exists: true, data: null, error: err.message };
  }
}

function envBool(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "oui"].includes(String(value).trim().toLowerCase());
}

function envInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let out = Math.trunc(n);
  if (Number.isFinite(min)) out = Math.max(min, out);
  if (Number.isFinite(max)) out = Math.min(max, out);
  return out;
}

function envFloat(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let out = n;
  if (Number.isFinite(min)) out = Math.max(min, out);
  if (Number.isFinite(max)) out = Math.min(max, out);
  return out;
}

/**
 * S'assure que fca-config.json existe et contient des réglages sûrs.
 * À appeler AVANT `require("@dongdev/fca-unofficial")`.
 *
 * Sans cela la librairie crée le fichier avec `autoUpdate: true` et
 * `checkUpdate.install: true`, ce qui déclenche un `npm install` au démarrage
 * (instable, parfois bloquant sur Render).
 *
 * @param {{ rootDir?: string, logger?: object }} [options]
 */
function ensureFcaConfig(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const logger = options.logger;
  const filePath = path.join(rootDir, "fca-config.json");
  const existing = readJsonFile(filePath);

  let next = FCA_SAFE_CONFIG;
  let reason = "créé (absent)";

  if (existing.exists && isPlainObject(existing.data)) {
    const merged = deepMerge(existing.data, FCA_SAFE_CONFIG);
    merged.autoUpdate = false;
    merged.checkUpdate = { ...(merged.checkUpdate || {}), enabled: false, install: false };
    merged.mqtt = { ...(merged.mqtt || {}), enabled: true };
    merged.remoteControl = { ...(merged.remoteControl || {}), enabled: false };
    next = merged;
    reason = "vérifié / corrigé";
  } else if (existing.exists && existing.error) {
    if (logger) logger.warn(`fca-config.json illisible (${existing.error}) → réécriture sûre.`, "config");
    reason = "réécrit (JSON invalide)";
  }

  try {
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    if (!existing.exists || fs.readFileSync(filePath, "utf8") !== serialized) {
      fs.writeFileSync(filePath, serialized, "utf8");
    }
    if (logger) logger.debug(`fca-config.json ${reason}.`, "config");
  } catch (err) {
    if (logger) logger.warn(`Impossible d'écrire fca-config.json (${err.message}).`, "config");
  }
  return next;
}

/** Chemin absolu du dossier de données. */
function resolveDataDir(config) {
  const raw = String((config.storage && config.storage.dir) || "data").trim() || "data";
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(ROOT_DIR, raw);
}

/**
 * Charge la configuration finale (config.json + variables d'environnement).
 *
 * @param {{ rootDir?: string, env?: NodeJS.ProcessEnv, logger?: object }} [options]
 * @returns {object} configuration + métadonnées (`_meta`, `ai`, `media`)
 */
function loadConfig(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const env = options.env || process.env;
  const logger = options.logger;
  const warnings = [];

  const configPath = path.join(rootDir, "config.json");
  const file = readJsonFile(configPath);
  let config = { ...DEFAULTS };

  if (file.exists && isPlainObject(file.data)) {
    config = deepMerge(DEFAULTS, file.data);
  } else if (file.exists && file.error) {
    warnings.push(`config.json invalide (${file.error}) → valeurs par défaut utilisées.`);
  } else if (!file.exists) {
    warnings.push("config.json absent → valeurs par défaut utilisées.");
  }

  // --- Overrides par variables d'environnement -----------------------------
  if (env.BOT_NAME) config.identity.name = String(env.BOT_NAME).trim() || config.identity.name;
  if (env.BOT_SHORT_NAME) config.identity.short = String(env.BOT_SHORT_NAME).trim() || config.identity.short;
  if (env.PREFIX) config.prefix = String(env.PREFIX);
  if (env.LANGUAGE) config.language = String(env.LANGUAGE).trim().toLowerCase() || config.language;

  // OWNER_UID est la source de vérité ; ADMIN_UID est conservé par compatibilité.
  const ownerFromEnv = String(env.OWNER_UID || env.ADMIN_UID || "").trim();
  if (ownerFromEnv) config.owner.uid = ownerFromEnv;

  if (env.LOG_LEVEL) config.logging.level = String(env.LOG_LEVEL).trim().toLowerCase();
  if (env.LOG_FILE !== undefined) config.logging.file = String(env.LOG_FILE).trim() || null;
  if (env.LOG_RETENTION) config.security.logRetention = envInt(env.LOG_RETENTION, config.security.logRetention, 10, 10000);

  if (env.DATA_DIR) config.storage.dir = String(env.DATA_DIR).trim();
  if (env.FLUSH_INTERVAL_MS) config.storage.flushIntervalMs = envInt(env.FLUSH_INTERVAL_MS, config.storage.flushIntervalMs, 500, 600000);
  if (env.SNAPSHOT_INTERVAL_MS) config.storage.snapshotIntervalMs = envInt(env.SNAPSHOT_INTERVAL_MS, config.storage.snapshotIntervalMs, 10000, 86400000);
  if (env.REMOTE_STORE_URL) config.storage.remote.url = String(env.REMOTE_STORE_URL).trim();
  if (env.REMOTE_STORE_TOKEN) config.storage.remote.token = String(env.REMOTE_STORE_TOKEN).trim();
  if (env.REMOTE_STORE_HEADER) config.storage.remote.header = String(env.REMOTE_STORE_HEADER).trim() || "x-api-key";

  if (env.ALLOW_EVAL !== undefined) config.security.allowEval = envBool(env.ALLOW_EVAL, config.security.allowEval);
  if (env.CONVERSATION !== undefined) config.conversation.enabled = envBool(env.CONVERSATION, config.conversation.enabled);
  if (env.CONVERSATION_PROBABILITY) {
    config.conversation.probability = envFloat(env.CONVERSATION_PROBABILITY, config.conversation.probability, 0, 1);
  }

  if (env.CURRENCY_SYMBOL) config.currency.symbol = String(env.CURRENCY_SYMBOL).trim() || config.currency.symbol;
  if (env.START_BALANCE) config.currency.startBalance = envInt(env.START_BALANCE, config.currency.startBalance, 0, 100000000);

  if (env.HEALTH_SERVER !== undefined) config.healthServer.enabled = envBool(env.HEALTH_SERVER, config.healthServer.enabled);
  if (env.HOST) config.healthServer.host = String(env.HOST).trim();
  if (env.PORT) config.healthServer.port = Number(env.PORT);

  if (env.SELF_LISTEN !== undefined) config.connection.selfListen = envBool(env.SELF_LISTEN, config.connection.selfListen);
  if (env.AUTO_MARK_READ !== undefined) config.connection.autoMarkRead = envBool(env.AUTO_MARK_READ, config.connection.autoMarkRead);
  if (env.ONLINE !== undefined) config.connection.online = envBool(env.ONLINE, config.connection.online);
  if (env.PROXY) config.connection.proxy = String(env.PROXY).trim();
  if (env.USER_AGENT) config.connection.userAgent = String(env.USER_AGENT).trim();
  if (env.LOGIN_RETRIES) config.connection.loginRetries = envInt(env.LOGIN_RETRIES, config.connection.loginRetries, 1, 10);
  if (env.LOGIN_RETRY_DELAY_MS) config.connection.loginRetryDelayMs = envInt(env.LOGIN_RETRY_DELAY_MS, config.connection.loginRetryDelayMs, 1000, 600000);

  // --- Services externes : uniquement via l'environnement (jamais commités) --
  const aiProvider = String(env.AI_PROVIDER || "").trim().toLowerCase();
  config.ai = {
    provider: aiProvider || "",
    model: String(env.AI_MODEL || "").trim(),
    apiKey: String(env.AI_API_KEY || env.OPENAI_API_KEY || env.GROQ_API_KEY || env.OPENROUTER_API_KEY || "").trim(),
    baseUrl: String(env.AI_BASE_URL || "").trim(),
    imageApiKey: String(env.IMAGE_API_KEY || "").trim(),
    maxTokens: envInt(env.AI_MAX_TOKENS, 700, 64, 8000)
  };
  // Déduction du fournisseur quand une clé est présente mais AI_PROVIDER absent.
  if (!config.ai.provider && config.ai.apiKey) {
    if (env.GROQ_API_KEY) config.ai.provider = "groq";
    else if (env.OPENROUTER_API_KEY) config.ai.provider = "openrouter";
    else config.ai.provider = "openai";
  }

  config.media = {
    apiUrl: String(env.MEDIA_API_URL || "").trim(),
    apiToken: String(env.MEDIA_API_TOKEN || "").trim(),
    // Recherche YouTube officielle (v3) : optionnelle, jamais contournée.
    youtubeApiKey: String(env.YOUTUBE_API_KEY || "").trim(),
    timeoutMs: envInt(env.MEDIA_TIMEOUT_MS, 20000, 3000, 120000),
    // Taille maximale acceptée pour un média renvoyé (octets).
    maxDownloadBytes: envInt(env.MEDIA_MAX_BYTES, 6 * 1024 * 1024, 65536, 25 * 1024 * 1024)
  };

  // --- Validation / normalisation -----------------------------------------
  if (!VALID_LOG_LEVELS.includes(config.logging.level)) {
    warnings.push(`logging.level "${config.logging.level}" inconnu → "info" utilisé.`);
    config.logging.level = "info";
  }
  config.security.logLevel = config.logging.level;

  if (typeof config.prefix !== "string" || config.prefix.length === 0) {
    warnings.push('prefix invalide → "/" utilisé.');
    config.prefix = "/";
  }
  config.prefix = config.prefix.slice(0, 8);
  if (/^\s|\s$/.test(config.prefix)) {
    warnings.push("prefix avec espaces en début/fin : détection des commandes risquée.");
  }

  const cleanOwner = String(config.owner.uid || "").trim();
  if (cleanOwner && !/^\d{5,25}$/.test(cleanOwner)) {
    warnings.push(`owner.uid "${cleanOwner}" ne ressemble pas à un UID Facebook (chiffres uniquement).`);
  }
  config.owner.uid = cleanOwner;
  if (!cleanOwner) warnings.push("Aucun OWNER_UID configuré : les commandes administrateur resteront verrouillées.");

  config.identity.name = String(config.identity.name || "IDREM").trim();
  config.identity.short = String(config.identity.short || config.identity.name.split(" ")[0]).trim();
  config.identity.version = String(config.identity.version || "0.0.0").trim();
  config.identity.mentionAliases = (Array.isArray(config.identity.mentionAliases) ? config.identity.mentionAliases : [])
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
  if (!config.identity.mentionAliases.includes(config.identity.short.toLowerCase())) {
    config.identity.mentionAliases.unshift(config.identity.short.toLowerCase());
  }

  config.currency.startBalance = Math.max(0, Number(config.currency.startBalance) || 0);
  config.currency.maxBalance = Math.max(1, Number(config.currency.maxBalance) || 1000000000);
  config.currency.symbol = String(config.currency.symbol || "IG").trim();

  config.xp.base = Math.max(10, Number(config.xp.base) || 100);
  config.xp.factor = Math.max(1.05, Number(config.xp.factor) || 1.5);
  config.xp.perMessage = Math.max(0, Number(config.xp.perMessage) || 0);
  config.xp.perCommand = Math.max(0, Number(config.xp.perCommand) || 0);
  config.xp.messageIntervalMs = Math.max(5000, Number(config.xp.messageIntervalMs) || 60000);
  config.xp.maxLevel = Math.min(9999, Math.max(10, Number(config.xp.maxLevel) || 200));

  const lim = config.limits;
  lim.defaultCooldownSeconds = Math.min(3600, Math.max(0, Number(lim.defaultCooldownSeconds) || 0));
  lim.globalCooldownMs = Math.min(60000, Math.max(0, Number(lim.globalCooldownMs) || 0));
  lim.floodMessages = Math.min(100, Math.max(2, Number(lim.floodMessages) || 6));
  lim.floodWindowMs = Math.min(600000, Math.max(1000, Number(lim.floodWindowMs) || 6000));
  lim.floodMuteMs = Math.min(3600000, Math.max(5000, Number(lim.floodMuteMs) || 60000));
  lim.maxMessageLength = Math.min(8000, Math.max(500, Number(lim.maxMessageLength) || 4000));
  lim.dedupeTtlMs = Math.min(3600000, Math.max(30000, Number(lim.dedupeTtlMs) || 300000));
  lim.maxWarns = Math.min(99, Math.max(1, Number(lim.maxWarns) || 3));
  lim.maxInventorySlots = Math.min(500, Math.max(1, Number(lim.maxInventorySlots) || 40));

  const conv = config.conversation;
  conv.probability = Math.min(1, Math.max(0, Number(conv.probability) || 0));
  conv.groupProbability = Math.min(1, Math.max(0, Number(conv.groupProbability) || 0));
  conv.threadCooldownMs = Math.min(3600000, Math.max(0, Number(conv.threadCooldownMs) || 0));
  conv.userCooldownMs = Math.min(3600000, Math.max(0, Number(conv.userCooldownMs) || 0));
  conv.minTextLength = Math.max(1, Number(conv.minTextLength) || 1);

  const eco = config.economy;
  eco.daily.cooldownHours = Math.min(72, Math.max(1, Number(eco.daily.cooldownHours) || 20));
  eco.daily.min = Math.max(0, Number(eco.daily.min) || 0);
  eco.daily.max = Math.max(eco.daily.min, Number(eco.daily.max) || eco.daily.min);
  eco.work.cooldownMinutes = Math.min(1440, Math.max(1, Number(eco.work.cooldownMinutes) || 45));
  eco.work.min = Math.max(0, Number(eco.work.min) || 0);
  eco.work.max = Math.max(eco.work.min, Number(eco.work.max) || eco.work.min);
  eco.crime.cooldownMinutes = Math.min(1440, Math.max(1, Number(eco.crime.cooldownMinutes) || 90));
  eco.crime.successRate = Math.min(1, Math.max(0, Number(eco.crime.successRate) || 0));
  eco.crime.min = Math.max(0, Number(eco.crime.min) || 0);
  eco.crime.max = Math.max(eco.crime.min, Number(eco.crime.max) || eco.crime.min);
  eco.crime.fineMin = Math.max(0, Number(eco.crime.fineMin) || 0);
  eco.crime.fineMax = Math.max(eco.crime.fineMin, Number(eco.crime.fineMax) || eco.crime.fineMin);
  eco.transferFeePercent = Math.min(50, Math.max(0, Number(eco.transferFeePercent) || 0));

  const games = config.games;
  games.sessionTimeoutMs = Math.min(3600000, Math.max(5000, Number(games.sessionTimeoutMs) || 90000));
  for (const key of ["win", "lose", "draw"]) {
    games.xpReward[key] = Math.max(0, Number(games.xpReward[key]) || 0);
    games.coinReward[key] = Math.max(0, Number(games.coinReward[key]) || 0);
  }

  config.moderation.allowedLinkDomains = (Array.isArray(config.moderation.allowedLinkDomains)
    ? config.moderation.allowedLinkDomains
    : []
  )
    .map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, ""))
    .filter(Boolean)
    .slice(0, 40);

  config.storage.flushIntervalMs = Math.min(600000, Math.max(500, Number(config.storage.flushIntervalMs) || 5000));
  config.storage.snapshotIntervalMs = Math.min(86400000, Math.max(10000, Number(config.storage.snapshotIntervalMs) || 300000));
  config.storage.remote.url = String(config.storage.remote.url || "").trim().replace(/\/+$/, "");
  config.storage.remote.header = String(config.storage.remote.header || "x-api-key").trim().toLowerCase() || "x-api-key";
  if (config.storage.remote.url && !/^https?:\/\//i.test(config.storage.remote.url)) {
    warnings.push("storage.remote.url doit commencer par http:// ou https:// → désactivé.");
    config.storage.remote.url = "";
  }

  config.connection.proxy = String(config.connection.proxy || "").trim();
  config.connection.userAgent = String(config.connection.userAgent || "").trim();
  config.connection.loginRetries = Math.min(10, Math.max(1, Number(config.connection.loginRetries) || 1));
  config.connection.loginRetryDelayMs = Math.max(1000, Number(config.connection.loginRetryDelayMs) || 10000);
  config.connection.maxReconnectAttempts = Math.min(100, Math.max(1, Number(config.connection.maxReconnectAttempts) || 8));

  if (config.healthServer.enabled) {
    const rawPort = config.healthServer.port;
    if (rawPort === 0 || rawPort === "0") config.healthServer.port = 0;
    else if (rawPort === null || rawPort === undefined || rawPort === "") config.healthServer.port = null;
    else {
      const port = Number(rawPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        warnings.push(`healthServer.port "${rawPort}" invalide → variable PORT ou 3000.`);
        config.healthServer.port = null;
      } else config.healthServer.port = port;
    }
  }

  // /eval reste désactivé en production sauf demande explicite.
  const envName = String(env.NODE_ENV || "development").toLowerCase();
  if (envName === "production" && config.security.allowEval && !envBool(env.ALLOW_EVAL, false)) {
    config.security.allowEval = false;
    warnings.push("/eval désactivé : NODE_ENV=production (ACTIVE ALLOW_EVAL=true pour l'autoriser).");
  }

  // --- Métadonnées ---------------------------------------------------------
  const pkg = readJsonFile(path.join(rootDir, "package.json"));
  const dataDir = resolveDataDir(config);
  config._meta = {
    rootDir,
    dataDir,
    env: envName,
    isProduction: envName === "production",
    version: String(config.identity.version || (isPlainObject(pkg.data) ? pkg.data.version : "0.0.0")),
    packageName: isPlainObject(pkg.data) ? String(pkg.data.name || "bot") : "bot",
    configPath,
    warnings
  };

  if (logger) for (const warning of warnings) logger.warn(warning, "config");

  return config;
}

module.exports = {
  ROOT_DIR,
  DEFAULTS,
  FCA_SAFE_CONFIG,
  VALID_LOG_LEVELS,
  loadConfig,
  ensureFcaConfig,
  resolveDataDir,
  deepMerge,
  readJsonFile,
  isPlainObject,
  envBool
};
