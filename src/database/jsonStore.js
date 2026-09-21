import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('db');

/**
 * Persistance JSON atomique avec écriture différée (debounce).
 * Volontairement sans base externe : le bot reste déployable partout
 * (Render, Railway, VPS) sans service additionnel.
 */
export class JsonStore {
  constructor(file, defaults = {}, { flushDelayMs = 250 } = {}) {
    this.file = file;
    this.defaults = structuredClone(defaults);
    this.flushDelayMs = flushDelayMs;
    this.data = structuredClone(defaults);
    this.timer = null;
    this.writing = null;
    this.dirty = false;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = this.#merge(structuredClone(this.defaults), parsed);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('base illisible, réinitialisation', { file: path.basename(this.file), reason: error.message });
      }
      this.data = structuredClone(this.defaults);
      await this.flush();
    }
    return this.data;
  }

  #merge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        base[key] = this.#merge(base[key] && typeof base[key] === 'object' ? base[key] : {}, value);
      } else if (value !== undefined) {
        base[key] = value;
      }
    }
    return base;
  }

  get(key) {
    return key ? this.data[key] : this.data;
  }

  set(key, value) {
    this.data[key] = value;
    this.scheduleFlush();
    return value;
  }

  /** Mise à jour fonctionnelle : `update('stats', s => ({...s, n: s.n + 1}))` */
  update(key, updater) {
    const next = updater(this.data[key]);
    return this.set(key, next);
  }

  scheduleFlush() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch((error) => logger.error('flush échoué', { reason: error.message }));
    }, this.flushDelayMs);
    if (this.timer.unref) this.timer.unref();
  }

  async flush() {
    if (!this.dirty && this.writing) return this.writing;
    this.dirty = false;

    const task = (async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      const payload = `${JSON.stringify(this.data, null, 2)}\n`;
      await fs.writeFile(tmp, payload, 'utf8');
      await fs.rename(tmp, this.file);
      try {
        await fs.chmod(this.file, 0o600);
      } catch {
        /* non bloquant selon le système de fichiers */
      }
    })();

    this.writing = task;
    try {
      await task;
    } finally {
      if (this.writing === task) this.writing = null;
    }
  }

  async close() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}

export default JsonStore;
