/**
 * Prépare l'environnement de test AVANT tout import des modules de l'application
 * (la configuration est lue au chargement des modules).
 * Ce fichier doit toujours être importé en premier dans un test.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'idrem-test-'));

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(TEST_ROOT, 'data');
process.env.SESSION_DIR = path.join(TEST_ROOT, 'sessions');
process.env.LOG_DIR = path.join(TEST_ROOT, 'logs');
process.env.TMP_DIR = path.join(TEST_ROOT, 'tmp');
process.env.LOG_TO_FILE = 'false';
process.env.LOG_LEVEL = 'error';
process.env.DASHBOARD_PASSWORD = 'test-password-123';
process.env.SESSION_SECRET = 'test-secret-0123456789abcdef';
process.env.API_KEY = '';
process.env.BOT_NAME = 'IDREM TERESHKOVA BOT';
process.env.PREFIX = '/';
process.env.STICKER_NAME = 'IDREM TERESHKOVA';
process.env.STICKER_AUTHOR = '';
process.env.ADMIN_NAME = 'Merdi';
process.env.ADMIN_NUMBER = '243970000000';
process.env.AUTO_RECONNECT = 'false';
process.env.AUTO_RETRY_ON_DISCONNECT = 'false';
process.env.ALLOW_EMBED = 'true';

for (const dir of [process.env.DATA_DIR, process.env.SESSION_DIR, process.env.LOG_DIR, process.env.TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export default TEST_ROOT;
