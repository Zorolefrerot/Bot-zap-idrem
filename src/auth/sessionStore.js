import fs from 'node:fs/promises';
import path from 'node:path';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import env from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('auth-store');

/**
 * Dossier des credentials WhatsApp (fichiers Baileys : creds.json + clés).
 * Gitignoré, jamais servi, jamais loggé en clair — seule la présence
 * des fichiers est inspectée.
 */
export const AUTH_DIR = path.join(env.paths.sessions, 'credentials');

function relative(dir) {
  return path.relative(env.root, dir) || path.basename(dir);
}

/**
 * Charge (ou initialise) l'état d'authentification Baileys.
 * Retourne `{ state, saveCreds, dir }` :
 *   - `state`    : `{ creds, keys }` à passer au socket (creds séparé,
 *                  keys enveloppé par makeCacheableSignalKeyStore côté client)
 *   - `saveCreds`: fonction de persistance à brancher sur `creds.update`
 *   - `dir`      : dossier effectif utilisé
 */
export async function loadAuthState(authDir = AUTH_DIR) {
  const dir = authDir || AUTH_DIR;
  await fs.mkdir(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  logger.debug('état d’auth chargé', { dir: relative(dir), hasCreds: Boolean(state.creds?.noiseKey) });

  return { state, saveCreds, dir };
}

/**
 * Indique si des credentials exploitables existent sur le disque
 * (reconnexion sans nouveau Pair Code possible).
 */
export async function hasStoredCredentials(authDir = AUTH_DIR) {
  try {
    const credsFile = path.join(authDir || AUTH_DIR, 'creds.json');
    const stat = await fs.stat(credsFile);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

/**
 * Efface tous les credentials stockés (nouvel appairage, logout, rotation).
 * Sans effet si le dossier n'existe pas.
 */
export async function clearAuthState(authDir = AUTH_DIR) {
  const dir = authDir || AUTH_DIR;
  try {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    logger.info('credentials supprimés', { dir: relative(dir) });
  } catch (error) {
    logger.warn('suppression des credentials échouée', { dir: relative(dir), reason: error.message });
    throw error;
  }
}

export default { AUTH_DIR, loadAuthState, hasStoredCredentials, clearAuthState };
