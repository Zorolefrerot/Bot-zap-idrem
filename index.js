'use strict';
/*
 * ═══════════════════════════════════════════════════════════
 *   🧬 𝗠𝗲𝗥~𝗡𝗘𝗟 — Bot Messenger multifonction
 *   Développé par : 𝗠𝗲𝗥𝗡𝗲𝗹 𝗣𝗿𝗼𝗱𝘂𝗰𝘁𝗶𝗼𝗻
 * ═══════════════════════════════════════════════════════════
 *   IA • Chat • Économie • XP • Jeux • Médias • Profils
 *   Groupe • Administration • Accueil des nouveaux membres
 */

const fs = require('fs');
const path = require('path');

const config = require('./core/config');
const { Logger } = require('./utils/logger');
const { Database } = require('./database/database');
const facebook = require('./services/facebook');
const { createAiService } = require('./services/ai');
const { createChatService } = require('./services/chat');
const { createAiPool } = require('./services/aiPool');
const { createImageGenerator } = require('./services/imageGenerator');
const { createImageSearch } = require('./services/imageSearch');
const { createAudioService } = require('./services/audio');
const { createVideoService } = require('./services/video');
const { createVideoGenerator } = require('./services/videoGenerator');
const { Bot } = require('./core/bot');
const { startKeepAlive } = require('./core/keepAlive');

/* ── Logger (avec masquage des secrets) ── */
const logger = new Logger({ logDir: config.logDir, level: config.nodeEnv === 'development' ? 'debug' : 'info' });
for (const s of config.secrets) logger.registerSecret(s);

function banner() {
  logger.info('╭━━〔 🧬 ' + config.botName + ' ⚡ 〕━━╮');
  logger.info('   ' + config.signature + ' — démarrage…');
  logger.info('╰━━〔 🧬 ' + config.botName + ' 〕━━╯');
}

function cleanTmp() {
  try {
    fs.mkdirSync(config.tmpDir, { recursive: true });
    for (const f of fs.readdirSync(config.tmpDir)) {
      const full = path.join(config.tmpDir, f);
      try {
        fs.rmSync(full, { force: true });
      } catch (_) { /* */ }
    }
  } catch (_) { /* jamais bloquer le démarrage */ }
}

/* Référence au bot pour les callbacks de connexion (déclarée au niveau module). */
let botRef = null;

async function connectWithRetry(loggerFn, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      loggerFn.info(`[facebook] tentative de connexion ${i}/${attempts}…`);
      return await facebook.connect(config, loggerFn, {
        // TOUT passe par le routeur : messages → commandes/chat, logs → accueil.
        onEvent: (ev) => {
          if (botRef) botRef.handleRawEvent(ev).catch(() => {});
        },
      });
    } catch (err) {
      lastErr = err;
      loggerFn.error(`[facebook] échec (${i}/${attempts}):`, err.message);
      if (i < attempts) await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
  throw lastErr;
}

async function main() {
  banner();
  cleanTmp();

  const db = new Database(config.dataDir, config);
  db.bumpStat('botStarts');

  /* Services — pool IA partagé (rotation automatique des fournisseurs) */
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

  /* Connexion Messenger */
  const adapter = await connectWithRetry(logger, 3);
  const bot = new Bot({ config, logger, db, adapter, services });
  botRef = bot;

  if (adapter.mode !== 'mock') {
    // L'écouteur a été branché via onEvent au moment du connect().
    logger.info('[bot] écoute des messages active.');
  } else {
    logger.warn('[bot] mode mock : aucun message réel ne sera reçu (tests/dev).');
  }

  /* Keep-alive Render */
  await startKeepAlive(config, logger);

  /* Extinction propre : persistance garantie */
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[bot] arrêt (${signal}) — sauvegarde des données…`);
    try {
      await bot.shutdown();
    } catch (_) { /* */ }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('[unhandledRejection]', reason));
  process.on('uncaughtException', (err) => logger.error('[uncaughtException]', err));

  logger.info(`[bot] ${config.botName} opérationnel — ${bot.commands.size} commandes, adapter=${adapter.mode}.`);
}

main().catch((err) => {
  logger.error('[fatal]', err);
  logger.error('➜ Vérifie la configuration (.env / appstate) puis relance le bot.');
  // Sur Render : garder le processus vivant pour le diagnostic, mais code de sortie propre en local.
  if (process.env.RENDER) {
    setTimeout(() => process.exit(1), 5000);
  } else {
    process.exit(1);
  }
});
