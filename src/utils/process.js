import { spawn } from 'node:child_process';
import { createLogger } from './logger.js';

const logger = createLogger('process');

/** Le processus tourne-t-il sous un orchestrateur (Render, Railway, PM2, Docker...) ? */
export function isManagedProcess() {
  return Boolean(
    process.env.RENDER_SERVICE_ID ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.pm_id ||
      process.env.DYNO ||
      process.env.KUBERNETES_SERVICE_HOST ||
      process.env.MANAGED === '1',
  );
}

/**
 * Redémarre le bot.
 * - sous un orchestrateur : sortie du processus (relancé automatiquement),
 * - en autonome : relance directe d'un processus détaché.
 */
export async function restartProcess({ beforeExit } = {}) {
  try {
    await beforeExit?.();
  } catch (error) {
    logger.warn('pré-redémarrage en erreur', { reason: error.message });
  }

  logger.info('redémarrage du bot');

  if (isManagedProcess()) {
    setTimeout(() => process.exit(Number(process.env.RESTART_EXIT_CODE || 1)), 250);
    return { mode: 'managed' };
  }

  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  child.unref();
  setTimeout(() => process.exit(0), 300);
  return { mode: 'respawn', pid: child.pid };
}

/** Arrête proprement le bot. */
export async function shutdownProcess({ beforeExit, code = 0 } = {}) {
  try {
    await beforeExit?.();
  } catch (error) {
    logger.warn('pré-extinction en erreur', { reason: error.message });
  }
  logger.info('arrêt du bot');
  setTimeout(() => process.exit(code), 250);
  return { mode: isManagedProcess() ? 'managed' : 'standalone' };
}
