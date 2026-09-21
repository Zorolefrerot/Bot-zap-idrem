import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import env from '../config/env.js';

/**
 * Fichiers temporaires (média WhatsApp, conversions ffmpeg...).
 * Tout est écrit dans TMP_DIR et supprimé systématiquement.
 */

let tmpRoot = env.paths.tmp;

try {
  await fs.mkdir(tmpRoot, { recursive: true });
  await fs.access(tmpRoot, fs.constants.W_OK);
} catch {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'idrem-'));
}

export function tempDir() {
  return tmpRoot;
}

export function createTempPath(ext = '.bin', prefix = 'media') {
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext.startsWith('.') ? ext : `.${ext}`}`;
  return path.join(tmpRoot, name);
}

export async function writeTempFile(buffer, ext = '.bin', prefix = 'media') {
  const file = createTempPath(ext, prefix);
  await fs.writeFile(file, buffer);
  return file;
}

export async function readAndRemove(file) {
  try {
    return await fs.readFile(file);
  } finally {
    await removeFile(file);
  }
}

export async function removeFile(file) {
  try {
    await fs.unlink(file);
  } catch {
    /* déjà supprimé */
  }
}

/** Exécute `fn(file)` sur un fichier temporaire puis le supprime. */
export async function withTempFile(buffer, ext, fn, prefix = 'media') {
  const file = await writeTempFile(buffer, ext, prefix);
  try {
    return await fn(file);
  } finally {
    await removeFile(file);
  }
}

/** Purge les fichiers temporaires de plus de `maxAgeMs` (défaut : 1 h). */
export async function cleanupTempFiles(maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now();
  let removed = 0;
  try {
    const entries = await fs.readdir(tmpRoot);
    for (const entry of entries) {
      const file = path.join(tmpRoot, entry);
      try {
        const stat = await fs.stat(file);
        if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(file);
          removed += 1;
        }
      } catch {
        /* entrée illisible : on ignore */
      }
    }
  } catch {
    /* tmpDir inaccessible */
  }
  return removed;
}
