'use strict';
/*
 * 🧬 MeR~NeL — systems/cloudSync.js
 * ☁️ SAUVEGARDE PERSISTANTE NEON (PostgreSQL serverless).
 *
 * Miroir complet des données du bot (users/XCoins/XP, groups, stats, bets)
 * vers une base Neon :
 *   - pull()  au DÉMARRAGE → restaure les JSON locaux (les XCoins, niveaux,
 *     paris, réglages… survivent aux redéploiements et redémarrages Render)
 *   - push()  après chaque autosave + à l'extinction → le cloud est à jour
 *   - table unique `bot_state (key, data JSONB)` — simple et solide
 *
 * L'URL de connexion vient de DATABASE_URL (variable d'environnement Render).
 * AUCUNE URL configurée → système désactivé : le bot tourne comme avant
 * (JSON locaux seuls). Les erreurs sont typées (CLOUD_SYNC_*) et JAMAIS
 * bloquantes : en cas de panne réseau, les JSON locaux restent la vérité.
 */

const fs = require('fs');
const path = require('path');

const TAG = '[cloud]';

function createCloudSync(logger, opts = {}) {
  const url = String(opts.url || '').trim();
  const syncMs = Math.max(60_000, Number(opts.syncMs) || 5 * 60 * 1000);
  /* [{ key: 'users', file: '/…/users.json' }, …] */
  const entries = Array.isArray(opts.files) ? opts.files : [];
  const poolFactory = opts.poolFactory || null;

  let pool = null;
  let ready = false;
  let queue = null; // sérialise les push (un seul à la fois)
  let lastError = null;

  const enabled = () => Boolean(url) && entries.length > 0;

  function typedError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  function readJson(file) {
    try {
      if (!fs.existsSync(file)) return null;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeJsonAtomic(file, data) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.cloud-tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, file);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function getClient() {
    if (!pool) {
      if (poolFactory) pool = poolFactory(url);
      else {
        const { Pool } = require('pg');
        // Neon exige SSL — `rejectUnauthorized:false` couvre tous les plans.
        pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2 });
      }
    }
    if (!ready) {
      await pool.query(
        'CREATE TABLE IF NOT EXISTS bot_state (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())'
      );
      ready = true;
      logger.info(`${TAG} ☁️ Neon connecté — sauvegarde persistante active (${entries.map((e) => e.key).join(', ')}).`);
    }
    return pool;
  }

  /**
   * Restaure les JSON locaux depuis le cloud (à appeler AVANT l'ouverture
   * des magasins). Le cloud fait foi ; s'il est vide, rien n'est touché.
   */
  async function pull() {
    if (!enabled()) return false;
    try {
      const client = await getClient();
      const { rows } = await client.query('SELECT key, data FROM bot_state');
      const restored = [];
      for (const row of rows) {
        const entry = entries.find((e) => e.key === row.key);
        if (!entry || !row.data || typeof row.data !== 'object') continue;
        writeJsonAtomic(entry.file, row.data);
        restored.push(`${entry.key} (${Object.keys(row.data).length})`);
      }
      if (restored.length) logger.info(`${TAG} 🔄 données restaurées depuis Neon : ${restored.join(' · ')}.`);
      else logger.info(`${TAG} base cloud vide — la première sauvegarde sera créée au prochain cycle.`);
      return true;
    } catch (err) {
      lastError = err;
      logger.warn(`${TAG} restauration impossible (${err.code || err.message}) — les JSON locaux sont conservés.`);
      return false;
    }
  }

  /** Envoie TOUT l'état local vers Neon (users, groups, stats, bets). */
  async function push(reason = 'auto') {
    if (!enabled()) return false;
    if (queue) return queue; // déjà une sauvegarde en vol → on s'y accroche
    queue = (async () => {
      try {
        const client = await getClient();
        for (const entry of entries) {
          const data = readJson(entry.file);
          if (!data) continue;
          await client.query(
            `INSERT INTO bot_state (key, data, updated_at)
             VALUES ($1, $2::jsonb, now())
             ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
            [entry.key, JSON.stringify(data)]
          );
        }
        if (reason === 'shutdown') logger.info(`${TAG} 💾 sauvegarde finale envoyée vers Neon.`);
        return true;
      } catch (err) {
        lastError = err;
        logger.warn(`${TAG} sauvegarde impossible (${err.code || err.message}) — nouveau cycle dans ${Math.round(syncMs / 1000)}s.`);
        return false;
      } finally {
        queue = null;
      }
    })();
    return queue;
  }

  /** Cycle automatique (appelé par le bot après chaque autosave disque). */
  function start() {
    if (!enabled()) return false;
    const timer = setInterval(() => {
      push('interval');
    }, syncMs);
    if (timer.unref) timer.unref();
    return true;
  }

  /** Flush final (extinction propre). */
  async function flush() {
    if (!enabled()) return false;
    return push('shutdown');
  }

  /** Ferme le pool de connexions (fin de process). */
  async function close() {
    if (!pool) return;
    try {
      await pool.end();
    } catch (_) {
      /* rien */
    }
    pool = null;
    ready = false;
  }

  return {
    get enabled() {
      return enabled();
    },
    get lastError() {
      return lastError;
    },
    pull,
    push,
    start,
    flush,
    close,
    typedError,
  };
}

module.exports = { createCloudSync };
