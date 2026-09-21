import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { DEFAULTS, PROJECT_NAME } from './defaults.js';

dotenv.config();

const ROOT = process.cwd();

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveDir(value, fallback) {
  const p = path.resolve(ROOT, value || fallback);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function list(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Génère un secret fort lorsqu'aucune valeur n'est fournie.
 * Le secret auto-généré est retourné avec un drapeau `generated`
 * afin d'être affiché UNE SEULE FOIS dans les logs du serveur.
 */
function secretOrGenerated(value, { bytes = 32, prefix = '' } = {}) {
  const clean = String(value || '').trim();
  if (clean.length >= 8) return { value: clean, generated: false };
  return { value: prefix + crypto.randomBytes(bytes).toString('base64url'), generated: true };
}

const dashboardPassword = secretOrGenerated(process.env.DASHBOARD_PASSWORD, { bytes: 12 });
const sessionSecret = secretOrGenerated(process.env.SESSION_SECRET, { bytes: 48 });

/** Version WhatsApp forcée : "2.3000.10232330003" -> [2, 3000, 10232330003] */
function parseWaVersion(value) {
  const nums = String(value || '')
    .split(/[.\s,]+/)
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  return nums.length >= 3 ? nums.slice(0, 3) : null;
}

export const env = Object.freeze({
  root: ROOT,
  projectName: PROJECT_NAME,
  nodeEnv: process.env.NODE_ENV || 'production',
  isProduction: (process.env.NODE_ENV || 'production') === 'production',
  isTest: process.env.NODE_ENV === 'test',

  host: process.env.HOST || '0.0.0.0',
  port: int(process.env.PORT, 3000),
  publicUrl: String(process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),

  // Autorise l'affichage du site dans un iframe (preview, portail d'hébergeur).
  // Mettre `false` en production pour durcir la protection anti-clickjacking.
  allowEmbed: bool(process.env.ALLOW_EMBED, true),

  security: Object.freeze({
    dashboardPassword: dashboardPassword.value,
    dashboardPasswordGenerated: dashboardPassword.generated,
    sessionSecret: sessionSecret.value,
    sessionSecretGenerated: sessionSecret.generated,
    apiKey: String(process.env.API_KEY || '').trim(),
    cookieName: 'idrem_auth',
    tokenTtlMs: int(process.env.AUTH_TTL_MS, 1000 * 60 * 60 * 12),
    rateLimit: Object.freeze({
      windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      max: int(process.env.RATE_LIMIT_MAX, 200),
      pairMax: int(process.env.PAIR_RATE_LIMIT_MAX, 5),
      loginMax: int(process.env.LOGIN_RATE_LIMIT_MAX, 10),
    }),
  }),

  paths: Object.freeze({
    data: resolveDir(process.env.DATA_DIR, './data'),
    sessions: resolveDir(process.env.SESSION_DIR, './sessions'),
    logs: resolveDir(process.env.LOG_DIR, './logs'),
    tmp: resolveDir(process.env.TMP_DIR, './tmp'),
    frontendDist: path.resolve(ROOT, 'frontend/dist'),
  }),

  logging: Object.freeze({
    level: process.env.LOG_LEVEL || 'info',
    toFile: bool(process.env.LOG_TO_FILE, true),
  }),

  whatsapp: Object.freeze({
    browserOs: process.env.WA_BROWSER_OS || 'Ubuntu',
    browserName: process.env.WA_BROWSER_NAME || 'IDREM Tereshkova',
    forcedVersion: parseWaVersion(process.env.WA_VERSION),
    autoReconnect: bool(process.env.AUTO_RECONNECT, true),
    autoRetry: bool(process.env.AUTO_RETRY_ON_DISCONNECT, true),
    syncFullHistory: bool(process.env.SYNC_FULL_HISTORY, false),
    pairingCodeTtlMs: int(process.env.PAIRING_CODE_TTL_MS, 60 * 1000),
  }),

  ffmpegPath: String(process.env.FFMPEG_PATH || '').trim(),

  /** Configuration bot par défaut (écrasable depuis le dashboard). */
  botDefaults: Object.freeze({
    botName: String(process.env.BOT_NAME || DEFAULTS.botName).trim(),
    prefix: String(process.env.PREFIX || DEFAULTS.prefix).trim(),
    stickerName: String(process.env.STICKER_NAME || DEFAULTS.stickerName).trim(),
    stickerAuthor: String(process.env.STICKER_AUTHOR || DEFAULTS.stickerAuthor).trim(),
    adminNumber: String(process.env.ADMIN_NUMBER || DEFAULTS.adminNumber).trim(),
    adminName: String(process.env.ADMIN_NAME || DEFAULTS.adminName).trim(),
  }),
});

export default env;
