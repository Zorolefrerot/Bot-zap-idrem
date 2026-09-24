'use strict';
/*
 * 🧬 MeR~NeL — tests/helpers.js
 * Boot du bot complet en mode mock (aucune connexion réelle) + outils.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('../core/config');
const { Logger } = require('../utils/logger');
const { Database } = require('../database/database');
const facebook = require('../services/facebook');
const { createAiService } = require('../services/ai');
const { createChatService } = require('../services/chat');
const { createAiPool } = require('../services/aiPool');
const { createImageGenerator } = require('../services/imageGenerator');
const { createImageSearch } = require('../services/imageSearch');
const { createAudioService } = require('../services/audio');
const { createVideoService } = require('../services/video');
const { createVideoGenerator } = require('../services/videoGenerator');
const { Bot } = require('../core/bot');

/* ── Décodage du gras Unicode pour les assertions ── */
function unbold(text) {
  let out = '';
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c >= 0x1d5ee && c <= 0x1d607) out += String.fromCodePoint(0x61 + (c - 0x1d5ee));
    else if (c >= 0x1d5d4 && c <= 0x1d5ed) out += String.fromCodePoint(0x41 + (c - 0x1d5d4));
    else if (c >= 0x1d7ec && c <= 0x1d7f5) out += String.fromCodePoint(0x30 + (c - 0x1d7ec));
    else if (c === 0x2009) out += ' '; // espace fine de groupement
    else out += ch;
  }
  return out.normalize('NFC');
}

/* Boucle d'attente (laisse tourner les timers/setImmediate) */
async function until(fn, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (fn()) return true;
    } catch (_) { /* réessaie */ }
    await new Promise((r) => setImmediate(r));
  }
  return false;
}

const UIDS = {
  admin: '61569333774600',
  owner: '100065927401614',
  shadow: '111111111111111', // non-admin
  paul: '222222222222222',
  fortiche: '333333333333333',
  spammer: '444444444444444',
};

const NAME_TO_UID = {
  Shadow: UIDS.shadow,
  Paul: UIDS.paul,
  Fortiche: UIDS.fortiche,
  Spammer: UIDS.spammer,
};

function makeMsg(threadID, senderID, body, extra = {}) {
  return Object.assign(
    {
      type: 'message',
      senderID,
      threadID,
      body,
      messageID: 'evt-' + Math.random().toString(36).slice(2, 10),
      mentions: {},
    },
    extra
  );
}

async function boot(opts = {}) {
  const dataDir = opts.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'mernel-test-'));
  config.dataDir = dataDir;
  config.tmpDir = path.join(dataDir, 'tmp');
  config.logDir = path.join(dataDir, 'logs');
  config.adapter = 'mock';
  config.port = 0;
  // Délais généreux : la suite tourne en parallèle, on évite les flakes de timers
  config.games.quizTimeoutMs = 45000;
  config.games.duelTimeoutMs = 45000;
  config.games.stepTimeoutMs = 90000;
  config.games.interDelayMs = 15;
  config.chat.minIntervalMs = 0;
  config.idle.sweepMs = 0; // pas de timer de veille en tests (sweep manuel)
  config.xp.messageCooldownMs = 0;
  // Anti-spam DÉSACTIVÉ par défaut en tests (les flux rapides des autres suites
  // ne doivent pas déclencher de warnings) — activé seulement via opts.spam.
  config.spam.duplicateLimit = 9999;
  config.spam.floodWindowMs = 0;
  config.spam.warnLimit = 2;
  config.spam.autoBan = true;
  if (opts.spam) {
    Object.assign(config.spam, opts.spam);
  }
  if (opts.adminUids) config.adminUids = opts.adminUids.slice();

  const logger = new Logger({ logDir: config.logDir, logFile: false });
  logger.level = 99; // silencieux pendant les tests

  const db = new Database(config.dataDir, config);

  const aiPool = createAiPool(logger);
  const services = {
    aiPool,
    ai: createAiService(logger, aiPool),
    chat: createChatService(logger, aiPool),
    imageGen: createImageGenerator(logger),
    imageSearch: createImageSearch(logger),
    audio: createAudioService(logger),
    video: createVideoService(logger),
    videoGen: createVideoGenerator(logger),
  };
  if (opts.serviceStubs) Object.assign(services, opts.serviceStubs);

  /* Câblage IDENTIQUE à index.js : tout événement passe par le routeur. */
  let bot = null;
  const connectHooks = Object.assign({}, opts.mock || {});
  const userOnEvent = connectHooks.onEvent;
  connectHooks.onEvent = (ev) => {
    if (!bot) return;
    if (userOnEvent) userOnEvent(ev);
    bot.handleRawEvent(ev).catch(() => {});
  };
  const adapter = await facebook.connect(config, logger, connectHooks);
  bot = new Bot({ config, logger, db, adapter, services });
  return { config, logger, db, adapter, bot, services, dataDir };
}

function lastBody(adapter, n = 1) {
  const item = adapter.sent[adapter.sent.length - n];
  return item ? unbold(item.payload.body || '') : '';
}

function bodies(adapter) {
  return adapter.sent.map((s) => unbold(s.payload.body || ''));
}

function clearCooldowns(bot) {
  bot.cooldowns.map.clear();
}

module.exports = { boot, unbold, until, makeMsg, lastBody, bodies, UIDS, NAME_TO_UID, clearCooldowns };
