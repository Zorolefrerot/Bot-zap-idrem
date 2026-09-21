#!/usr/bin/env node
/**
 * IDREM TERESHKOVA BOT — point d'entrée.
 * Démarre : base de données, bot WhatsApp (Baileys), serveur web (API + frontend).
 */
import env from './config/env.js';
import { createLogger, initLogger } from './utils/logger.js';
import db from './database/index.js';
import botManager from './bot/manager.js';
import { createServer } from './web/server.js';
import { cleanupTempFiles } from './utils/tempfile.js';
import { resolveFfmpegPath } from './utils/ffmpeg.js';
import { PROJECT_NAME, SESSION_ID_PREFIX } from './config/defaults.js';

initLogger({ level: env.logging.level, toFile: env.logging.toFile, logDir: env.paths.logs });
const logger = createLogger('main');

function banner(port) {
  const url = env.publicUrl || `http://localhost:${port}`;
  const lines = [
    '',
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
    `   ${PROJECT_NAME}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    `  🌐 Dashboard / API : ${url}`,
    `  🩺 Healthcheck     : ${url}/api/health`,
    `  🔐 Session ID      : préfixe ${SESSION_ID_PREFIX}`,
    `  🧩 Commandes       : ${botManager.commands.size}`,
  ];

  if (env.security.dashboardPasswordGenerated) {
    lines.push(
      '',
      '  ⚠️  DASHBOARD_PASSWORD absent : mot de passe généré pour cette session.',
      `  🔑 Mot de passe du dashboard : ${env.security.dashboardPassword}`,
      '  ➡️  Renseignez-le dans .env pour le rendre permanent.',
    );
  }

  logger.info(lines.join('\n'));
}

async function main() {
  await db.init();

  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) {
    logger.warn(
      'ffmpeg indisponible : /tovideo, /toaudio et les stickers animés sont désactivés (images et /vv restent fonctionnels)',
    );
  }

  await botManager.boot();

  const { server } = createServer(botManager);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.port, env.host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  banner(server.address().port);

  const cleanupTimer = setInterval(() => {
    cleanupTempFiles().catch(() => {});
  }, 60 * 60 * 1000);
  cleanupTimer.unref();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('arrêt en cours', { signal });

    clearInterval(cleanupTimer);

    const forceExit = setTimeout(() => {
      logger.warn('arrêt forcé (délai dépassé)');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      await new Promise((resolve) => server.close(resolve));
      await botManager.shutdown();
      await db.close();
    } catch (error) {
      logger.error('erreur pendant l’arrêt', { reason: error.message });
    }

    clearTimeout(forceExit);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('promesse rejetée non gérée', { reason: reason instanceof Error ? reason.message : String(reason) });
  });

  // Une exception isolée (souvent réseau/Baileys) ne doit pas tuer le bot :
  // on journalise, et on ne s'arrête qu'en cas de répétition rapprochée.
  const crashWindow = [];
  process.on('uncaughtException', (error) => {
    logger.error('exception non interceptée', { reason: error.message });

    const now = Date.now();
    crashWindow.push(now);
    while (crashWindow.length && now - crashWindow[0] > 60_000) crashWindow.shift();

    if (crashWindow.length >= 3) {
      logger.error('exceptions répétées : arrêt et redémarrage par l’orchestrateur');
      shutdown('uncaughtException');
    }
  });
}

main().catch((error) => {
  logger.error('démarrage impossible', { reason: error.message, stack: error.stack });
  process.exit(1);
});
