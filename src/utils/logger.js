import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';

/**
 * Journalisation centralisée.
 * Deux garanties :
 *  1. toute métadonnée est SANITISÉE (les champs sensibles sont censurés),
 *  2. les derniers événements sont conservés dans un ring buffer en mémoire
 *     pour être affichés dans le dashboard ("logs récents non sensibles").
 */

const SENSITIVE_KEY = /(password|passwd|secret|token|session(id)?|pair(ing)?code|code|creds|credential|noisekey|privatekey|publickey|signedidentity|identitykey|registration|apikey|api_key|cookie|authorization)/i;

const MAX_BUFFER = 200;
const MAX_VALUE_LENGTH = 240;

const buffer = [];
let bufferListeners = [];

export function getLogBuffer(limit = 60) {
  return buffer.slice(-Math.max(1, Math.min(limit, MAX_BUFFER)));
}

export function onLogEntry(fn) {
  bufferListeners.push(fn);
  return () => {
    bufferListeners = bufferListeners.filter((l) => l !== fn);
  };
}

export function clearLogBuffer() {
  buffer.length = 0;
}

function censor(value) {
  const str = String(value);
  if (str.length <= 8) return '••••';
  return `${str.slice(0, 2)}••••${str.slice(-2)}`;
}

/** Supprime/censure récursivement toute donnée sensible. */
export function sanitize(input, depth = 0) {
  if (depth > 4 || input === undefined) return undefined;
  if (input === null) return null;

  if (typeof input === 'string') {
    return input.length > MAX_VALUE_LENGTH ? `${input.slice(0, MAX_VALUE_LENGTH)}…` : input;
  }
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (input instanceof Error) {
    return { name: input.name, message: input.message, status: input.status };
  }
  if (Buffer.isBuffer(input)) return `<Buffer ${input.length}b>`;
  if (Array.isArray(input)) {
    return input.slice(0, 20).map((v) => sanitize(v, depth + 1));
  }
  if (typeof input === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = value === undefined || value === null || value === '' ? value : censor(value);
        continue;
      }
      out[key] = sanitize(value, depth + 1);
    }
    return out;
  }
  return String(input);
}

function createPino({ level, toFile, logDir }) {
  const streams = [{ stream: process.stdout }];

  if (toFile && logDir) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const file = path.join(logDir, 'app.log');
      streams.push({ level, stream: fs.createWriteStream(file, { flags: 'a' }) });
    } catch {
      // Le fichier de log est un confort : on ne bloque jamais le démarrage.
    }
  }

  return pino(
    {
      level,
      base: { app: 'idrem-tereshkova-bot' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    streams.length > 1 ? pino.multistream(streams) : streams[0].stream,
  );
}

let rootLogger = null;

export function initLogger({ level = 'info', toFile = true, logDir = null } = {}) {
  rootLogger = createPino({ level, toFile, logDir });
  return rootLogger;
}

function getPino() {
  if (!rootLogger) rootLogger = createPino({ level: 'info', toFile: false });
  return rootLogger;
}

function push(level, scope, message, meta) {
  const entry = {
    time: new Date().toISOString(),
    level,
    scope,
    msg: message,
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  };

  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
  for (const listener of bufferListeners) {
    try {
      listener(entry);
    } catch {
      /* un listener défaillant ne doit jamais casser le bot */
    }
  }

  const pinoInstance = getPino();
  const fn = level === 'error' ? pinoInstance.error : level === 'warn' ? pinoInstance.warn : level === 'debug' ? pinoInstance.debug : pinoInstance.info;
  fn.call(pinoInstance, { scope, ...(entry.meta ? { meta: entry.meta } : {}) }, message);
}

/**
 * Crée un logger scopé. `meta` est systématiquement sanitisée :
 * aucun credential WhatsApp ne peut fuiter dans les logs publics.
 */
export function createLogger(scope = 'app') {
  return {
    scope,
    info: (message, meta) => push('info', scope, message, sanitize(meta)),
    warn: (message, meta) => push('warn', scope, message, sanitize(meta)),
    error: (message, meta) => push('error', scope, message, sanitize(meta)),
    debug: (message, meta) => push('debug', scope, message, sanitize(meta)),
  };
}

/** Logger "muet" compatible Baileys (évite le bruit interne de la lib). */
export const baileysLogger = pino({ level: process.env.LOG_LEVEL === 'debug' ? 'info' : 'silent' });

export default createLogger;
