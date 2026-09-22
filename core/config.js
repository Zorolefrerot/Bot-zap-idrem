'use strict';
/*
 * 🧬 MeR~NeL — core/config.js
 * Configuration centralisée. Les secrets vivent UNIQUEMENT dans .env
 * (jamais dans le code, jamais sur GitHub).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Charge un fichier .env sans écraser les variables déjà présentes. */
function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return;
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (err) {
    // Un .env illisible ne doit jamais faire planter le bot.
    // eslint-disable-next-line no-console
    console.error('[config] .env illisible:', err.message);
  }
}

loadEnvFile(path.join(ROOT, '.env'));

const env = process.env;
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const splitList = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/* Admins par défaut intégrés (surchargeables via ADMIN_UIDS / OWNER_UID). */
const DEFAULT_ADMIN_UIDS = '61569333774600,100065927401614';
const DEFAULT_OWNER_UID = '100065927401614';
const adminUids = splitList(env.ADMIN_UIDS || DEFAULT_ADMIN_UIDS);
if (adminUids.length === 0) {
  // Garde-fou : aucune liste vide — au minimum l'owner déclaré.
  if (env.OWNER_UID) adminUids.push(String(env.OWNER_UID).trim());
}

/*
 * ⚠️ FACILITÉ DE DÉPLOIEMENT : une clé Agnes par défaut est intégrée ici pour
 * que le bot fonctionne sans aucune variable d'environnement (à l'exception
 * de APPSTATE_JSON). Elle peut être surchargée via AGNES_API_KEY dans .env.
 * ⚠️ N'importe qui ayant accès à ce dépôt peut lire cette clé.
 */
const DEFAULT_AGNES_KEY = 'sk-5xR8wfBjmIRB3znAYqTPXSFuOvB0t1vOPuOc1etAtz6nuZrh';
const envAgnesKey = (env.AGNES_API_KEY || '').trim();
const agnesKey = envAgnesKey && !/YOUR_/i.test(envAgnesKey) ? envAgnesKey : DEFAULT_AGNES_KEY;
const shizoKey = (env.SHIZO_API_KEY || '').trim();

const config = {
  root: ROOT,

  /* Identité */
  botName: env.BOT_NAME || 'MeR~NeL',
  signature: env.BOT_SIGNATURE || 'MeR~NeL Production',
  prefix: (env.PREFIX || 'X').trim() || 'X',

  /* Administrateurs */
  adminUids,
  ownerUid: String(env.OWNER_UID || DEFAULT_OWNER_UID || adminUids[0] || '').trim(),

  /* Adaptateur Messenger : 'ws3-fca' (production) | 'mock' (tests/dev) */
  adapter: (env.BOT_ADAPTER || 'ws3-fca').trim(),
  appstateFile: env.APPSTATE_FILE || 'appstate.json',
  appstateJson: env.APPSTATE_JSON || '',

  /* Dossiers */
  dataDir: env.DATA_DIR || path.join(ROOT, 'database', 'data'),
  tmpDir: env.TMP_DIR || path.join(ROOT, 'tmp'),
  logDir: env.LOG_DIR || path.join(ROOT, 'logs'),

  /* Serveur keep-alive */
  port: int(env.PORT, 3000),

  /* Environnement */
  nodeEnv: env.NODE_ENV || 'production',

  /* APIs — les clés ne sortent JAMAIS d'ici (redaction automatique) */
  agnes: {
    baseUrl: (env.AGNES_API_URL || 'https://apihub.agnes-ai.com/v1').replace(/\/+$/, ''),
    apiKey: agnesKey,
    imageModel: env.AGNES_IMAGE_MODEL || 'dall-e-3',
    imageEndpoint: env.AGNES_IMAGE_ENDPOINT || '/images/generations',
    hasKey: () => Boolean(agnesKey) && !/YOUR_/i.test(agnesKey),
  },
  shizo: {
    baseUrl: (env.SHIZO_API_URL || 'https://api.shizo.top/ai/gpt').replace(/\/+$/, ''),
    apiKey: shizoKey || 'shizo',
    timeoutMs: int(env.SHIZO_TIMEOUT_MS, 25000),
  },
  geminiChatUrl: (env.GEMINI_CHAT_URL || 'https://arychauhann.onrender.com/api/gemini-proxy2').replace(/\/+$/, ''),
  chatTimeoutMs: int(env.CHAT_TIMEOUT_MS, 30000),

  /* Économie */
  economy: {
    dailyReward: int(env.DAILY_REWARD, 350),
    dailyCooldownMs: int(env.DAILY_COOLDOWN_HOURS, 24) * 3600 * 1000,
    startBalance: int(env.START_BALANCE, 500),
  },

  /* Médias */
  media: {
    maxImages: Math.min(Math.max(int(env.MAX_IMAGES, 5), 1), 5),
    mediaMaxSeconds: int(env.MEDIA_MAX_SECONDS, 120),
    downloadTimeoutMs: int(env.DOWNLOAD_TIMEOUT_MS, 90000),
  },

  /* Jeux */
  games: {
    quizTimeoutMs: int(env.QUIZ_TIMEOUT_MS, 30000),
    duelTimeoutMs: int(env.DUEL_TIMEOUT_MS, 25000),
    stepTimeoutMs: int(env.SESSION_STEP_TIMEOUT_MS, 150000),
    quizCoinsPerCorrect: int(env.QUIZ_COINS_PER_CORRECT, 15),
    interDelayMs: int(env.QUIZ_INTER_DELAY_MS, 1200),
    duelAllowedCounts: [10, 20, 30],
  },

  /* Anti-spam */
  spam: {
    duplicateLimit: int(env.SPAM_DUPLICATE_LIMIT, 5),
    timeWindowMs: int(env.SPAM_TIME_WINDOW_MS, 30000),
    warnLimit: int(env.SPAM_WARN_LIMIT, 3),
    muteMinutes: int(env.SPAM_MUTE_MINUTES, 10),
  },

  /* Chat automatique */
  chat: {
    minIntervalMs: int(env.CHAT_MIN_INTERVAL_MS, 3000),
    contextTurns: int(env.CHAT_CONTEXT_TURNS, 8),
  },

  /* 🌙 Mode veille automatique (#40) */
  idle: {
    standbyMs: int(env.IDLE_STANDBY_MINUTES, 30) * 60 * 1000, // 30 min par défaut
    sweepMs: int(env.IDLE_SWEEP_MS, 60000), // vérification chaque minute
    announce: (env.STANDBY_ANNOUNCE || 'true') !== 'false',
    wakeAnnounceCooldownMs: int(env.STANDBY_WAKE_COOLDOWN_MS, 60000),
  },

  /* XP */
  xp: {
    perMessage: int(env.XP_PER_MESSAGE, 6),
    perCommand: int(env.XP_PER_COMMAND, 12),
    messageCooldownMs: int(env.XP_MESSAGE_COOLDOWN_MS, 30000),
    duelWin: 40,
    duelLose: 15,
    daily: 20,
  },

  /* Secrets à masquer dans les logs/erreurs */
  secrets: [agnesKey, shizoKey].filter((s) => s && s.length > 3),
};

/* Retourne true si l'UID fourni appartient à la liste des administrateurs. */
config.isAdmin = function isAdmin(userID) {
  if (!userID) return false;
  return adminUids.includes(String(userID).trim());
};

config.isOwner = function isOwner(userID) {
  return Boolean(config.ownerUid) && String(userID).trim() === config.ownerUid;
};

module.exports = config;
