"use strict";

/**
 * services/store.js
 * ---------------------------------------------------------------------------
 * Persistance JSON fiable.
 *
 * Objectifs :
 *   1. Ne JAMAIS corrompre un fichier : écriture atomique (temp + rename) et
 *      file d'attente sérialisée (un seul write simultané par collection).
 *   2. Ne JAMAIS bloquer le bot : les écritures sont groupées (debounce).
 *   3. Survivre à Render : le système de fichiers d'un service Render est
 *      ÉPHÉMÈRE. Deux solutions sont prévues (configurables, non exclusives) :
 *        • DATA_DIR  → monter un disque Render (Settings → Disks) et pointer
 *                      DATA_DIR vers /var/data (persistance native) ;
 *        • REMOTE_STORE_URL → sauvegarde/restauration d'un instantané JSON
 *                      vers un petit service HTTP (aucune dépendance ajoutée,
 *                      `fetch` natif de Node ≥ 18).
 *   4. Récupérer un fichier abîmé sans perdre le bot : le JSON invalide est
 *      mis de côté (.corrupt-<date>) et la collection repart de zéro.
 * ---------------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/** Écrit un fichier de façon atomique (temp + rename). */
function writeJsonFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(tmp, serialized, "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Windows / FS exotiques : repli sur un écrasement direct.
    try {
      fs.copyFileSync(tmp, filePath);
      fs.unlinkSync(tmp);
    } catch {
      throw err;
    }
  }
  return serialized.length;
}

/** Lit un fichier JSON ; ne lève jamais d'exception. */
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, data: null };
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    if (!raw.trim()) return { exists: true, data: null, empty: true };
    return { exists: true, data: JSON.parse(raw) };
  } catch (err) {
    return { exists: true, data: null, error: err.message };
  }
}

/**
 * Une collection persistée (un fichier JSON).
 */
class Store {
  /**
   * @param {string} name          nom de la collection (ex. "users")
   * @param {object} options
   * @param {string} options.dir   dossier de données (absolu)
   * @param {*} [options.initial]  valeur initiale ({} ou [])
   * @param {number} [options.flushIntervalMs]
   * @param {object} [options.logger]
   * @param {(store: Store) => Promise<void>} [options.onSnapshot]
   */
  constructor(name, options = {}) {
    this.name = name;
    this.dir = options.dir;
    this.filePath = path.join(options.dir, `${name}.json`);
    this.initial = options.initial !== undefined ? options.initial : {};
    this.flushIntervalMs = Math.max(200, Number(options.flushIntervalMs) || 5000);
    this.logger = options.logger || noopLogger;
    this.onSnapshot = typeof options.onSnapshot === "function" ? options.onSnapshot : null;

    /** @type {*} données en mémoire (source de vérité pendant l'exécution) */
    this.data = this.cloneInitial();

    this.dirty = false;
    this.loaded = false;
    this.writing = Promise.resolve();
    this.timer = null;
    this.lastFlushAt = 0;
    this.writes = 0;
    this.writeErrors = 0;
  }

  cloneInitial() {
    return Array.isArray(this.initial) ? [...this.initial] : { ...this.initial };
  }

  /** Charge depuis le disque (et récupère un fichier corrompu). */
  load() {
    if (this.loaded) return this.data;
    this.loaded = true;

    const file = readJsonFile(this.filePath);
    if (!file.exists) {
      this.data = this.cloneInitial();
      this.logger.debug(`[${this.name}] aucun fichier → initialisation vierge.`, "store");
      return this.data;
    }
    if (file.error) {
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(this.filePath, backup);
      } catch {
        /* non bloquant */
      }
      this.logger.error(
        `[${this.name}] JSON invalide (${file.error}) → fichier mis de côté (${path.basename(backup)}), collection réinitialisée.`,
        "store"
      );
      this.data = this.cloneInitial();
      return this.data;
    }
    if (file.empty || file.data === null) {
      this.data = this.cloneInitial();
      return this.data;
    }

    const expectedArray = Array.isArray(this.initial);
    if (expectedArray && !Array.isArray(file.data)) {
      this.logger.warn(`[${this.name}] contenu attendu : tableau → réinitialisation.`, "store");
      this.data = this.cloneInitial();
    } else if (!expectedArray && (typeof file.data !== "object" || file.data === null || Array.isArray(file.data))) {
      this.logger.warn(`[${this.name}] contenu attendu : objet → réinitialisation.`, "store");
      this.data = this.cloneInitial();
    } else {
      this.data = file.data;
    }
    return this.data;
  }

  /** Marque la collection comme modifiée et programme une écriture groupée. */
  save() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch((err) => {
        this.logger.error(`[${this.name}] flush périodique échoué : ${err.message}`, "store");
      });
    }, this.flushIntervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  /** Écrit immédiatement (sérialisé : jamais deux writes simultanés). */
  flush() {
    if (!this.dirty && this.lastFlushAt > 0) return this.writing;
    this.dirty = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Chaîne séquentielle : chaque écriture attend la précédente.
    this.writing = this.writing.then(async () => {
      try {
        this.load();
        writeJsonFileAtomic(this.filePath, this.data);
        this.writes += 1;
        this.lastFlushAt = Date.now();
      } catch (err) {
        this.writeErrors += 1;
        this.dirty = true; // on retentera au prochain cycle
        this.logger.error(`[${this.name}] écriture impossible : ${err.message}`, "store");
      }
    });
    return this.writing;
  }

  /** Remplace entièrement le contenu (utilisé par la restauration distante). */
  replace(data) {
    const expectedArray = Array.isArray(this.initial);
    if (expectedArray && !Array.isArray(data)) return false;
    if (!expectedArray && (typeof data !== "object" || data === null || Array.isArray(data))) return false;
    this.data = data;
    this.loaded = true;
    this.save();
    return true;
  }

  /** Taille approximative en mémoire (nombre d'entrées). */
  get size() {
    this.load();
    return Array.isArray(this.data) ? this.data.length : Object.keys(this.data).length;
  }

  stopTimers() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Gestionnaire de toutes les collections du bot.
 *
 * @param {object} options
 * @param {string} options.dir
 * @param {object} [options.logger]
 * @param {object} [options.remote]  { url, token, header }
 * @param {number} [options.flushIntervalMs]
 * @param {number} [options.snapshotIntervalMs]
 */
function createStoreManager(options = {}) {
  const dir = options.dir;
  const logger = options.logger || noopLogger;
  const remote = options.remote || { url: "", token: "", header: "x-api-key" };
  const flushIntervalMs = Number(options.flushIntervalMs) || 5000;
  const snapshotIntervalMs = Number(options.snapshotIntervalMs) || 300000;

  /** @type {Map<string, Store>} */
  const stores = new Map();
  let snapshotTimer = null;
  let stopped = false;

  fs.mkdirSync(dir, { recursive: true });

  /**
   * Récupère (ou crée) une collection.
   *
   * @param {string} name
   * @param {*} [initial] valeur initiale si la collection n'existe pas encore
   */
  function get(name, initial) {
    const key = String(name);
    if (stores.has(key)) return stores.get(key);
    const store = new Store(key, { dir, initial, flushIntervalMs, logger });
    store.load();
    stores.set(key, store);
    return store;
  }

  function flushAll() {
    return Promise.all([...stores.values()].map((store) => store.flush())).then(() => undefined);
  }

  function stopTimers() {
    for (const store of stores.values()) store.stopTimers();
    if (snapshotTimer) {
      clearInterval(snapshotTimer);
      snapshotTimer = null;
    }
  }

  /** Écrit tout, puis arrête les minuteries. À appeler à l'extinction. */
  async function shutdown() {
    if (stopped) return;
    stopped = true;
    stopTimers();
    await flushAll();
    logger.debug("Données sauvegardées avant arrêt.", "store");
  }

  // --- Sauvegarde distante optionnelle (Render sans disque monté) ----------

  function remoteEnabled() {
    return Boolean(remote && remote.url && typeof fetch === "function");
  }

  function remoteHeaders() {
    const headers = { "content-type": "application/json", accept: "application/json" };
    if (remote.token) headers[remote.header || "x-api-key"] = remote.token;
    return headers;
  }

  function remoteUrlFor(name) {
    return `${String(remote.url).replace(/\/+$/, "")}/${encodeURIComponent(name)}`;
  }

  /**
   * Téléverse une collection. Échoue silencieusement (log warn) : la copie
   * locale reste la référence tant que le dépôt distant n'est pas joignable.
   */
  async function pushRemote(name, data) {
    if (!remoteEnabled()) return false;
    try {
      const res = await fetch(remoteUrlFor(name), {
        method: "PUT",
        headers: remoteHeaders(),
        body: JSON.stringify({ name, updatedAt: new Date().toISOString(), data }),
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) {
        logger.warn(`Snapshot distant refusé pour "${name}" (HTTP ${res.status}).`, "store");
        return false;
      }
      return true;
    } catch (err) {
      logger.warn(`Snapshot distant impossible pour "${name}" : ${err.message}`, "store");
      return false;
    }
  }

  /** Récupère une collection distante (null si indisponible). */
  async function pullRemote(name) {
    if (!remoteEnabled()) return null;
    try {
      const res = await fetch(remoteUrlFor(name), {
        headers: remoteHeaders(),
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) {
        if (res.status !== 404) logger.warn(`Lecture distante de "${name}" : HTTP ${res.status}.`, "store");
        return null;
      }
      const payload = await res.json();
      if (payload && typeof payload === "object" && "data" in payload) return payload.data;
      return payload;
    } catch (err) {
      logger.warn(`Lecture distante impossible pour "${name}" : ${err.message}`, "store");
      return null;
    }
  }

  /** Envoie toutes les collections vers le dépôt distant. */
  async function snapshotRemote() {
    if (!remoteEnabled()) return { enabled: false, pushed: 0 };
    let pushed = 0;
    for (const [name, store] of stores) {
      const ok = await pushRemote(name, store.data);
      if (ok) pushed += 1;
    }
    if (pushed) logger.info(`Snapshot distant : ${pushed}/${stores.size} collection(s).`, "store");
    return { enabled: true, pushed, total: stores.size };
  }

  /**
   * Restaure depuis le dépôt distant UNIQUEMENT si la copie locale est vide
   * ou absente — on n'écrase jamais des données locales plus récentes.
   */
  async function restoreRemote(names) {
    if (!remoteEnabled()) return { enabled: false, restored: [] };
    const restored = [];
    const targets = Array.isArray(names) ? names : [...stores.keys()];
    for (const name of targets) {
      const store = get(name);
      const localEmpty = store.size === 0;
      const fileExists = fs.existsSync(store.filePath);
      if (fileExists && !localEmpty) continue;

      const data = await pullRemote(name);
      if (data === null || data === undefined) continue;
      if (store.replace(data)) {
        restored.push(name);
        logger.info(`Collection "${name}" restaurée depuis le dépôt distant.`, "store");
      }
    }
    return { enabled: true, restored };
  }

  /** Démarre la sauvegarde distante périodique. */
  function startSnapshotLoop() {
    if (!remoteEnabled() || snapshotTimer) return false;
    snapshotTimer = setInterval(() => {
      snapshotRemote().catch((err) => logger.error(`Snapshot distant échoué : ${err.message}`, "store"));
    }, snapshotIntervalMs);
    if (typeof snapshotTimer.unref === "function") snapshotTimer.unref();
    logger.info(`Sauvegarde distante activée toutes les ${Math.round(snapshotIntervalMs / 1000)}s.`, "store");
    return true;
  }

  /** État pour /stats et le health endpoint. */
  function stats() {
    const collections = {};
    for (const [name, store] of stores) {
      collections[name] = { entries: store.size, writes: store.writes, errors: store.writeErrors, dirty: store.dirty };
    }
    return {
      dir,
      remoteEnabled: remoteEnabled(),
      remoteUrl: remoteEnabled() ? remote.url : "",
      collections
    };
  }

  return {
    Store,
    get,
    collection: get,
    flushAll,
    stopTimers,
    shutdown,
    snapshotRemote,
    restoreRemote,
    startSnapshotLoop,
    remoteEnabled,
    stats,
    writeJsonFileAtomic,
    readJsonFile
  };
}

module.exports = { createStoreManager, Store, writeJsonFileAtomic, readJsonFile };
