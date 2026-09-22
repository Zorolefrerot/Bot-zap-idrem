'use strict';
/*
 * 🧬 MeR~NeL — services/facebook.js
 * Adaptateur Messenger.
 *  - Production : ws3-fca (connexion par appstate/cookies, jamais de mot de passe en clair).
 *  - Tests/dev  : adapter « mock » (aucune connexion réelle).
 * Chaque capacité réelle de l'API est détectée — le bot n'invente jamais
 * une action que la plateforme ne supporte pas.
 */

const fs = require('fs');
const path = require('path');

/* ──────────────────────────  Helpers communs  ────────────────────────── */

function normalizeError(err, fallbackCode = 'FB_ERROR') {
  if (!err) return new Error(fallbackCode);
  if (err instanceof Error) return err;
  const e = new Error(typeof err === 'string' ? err : JSON.stringify(err));
  e.code = err.error || err.code || fallbackCode;
  return e;
}

function promisify(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      try {
        fn(...args, (err, result) => (err ? reject(normalizeError(err)) : resolve(result)));
      } catch (e) {
        reject(normalizeError(e));
      }
    });
}

/* Envoie un payload {body, attachment?, mentions?} — attachment: chemin de fichier ou stream ou URL. */
function sendMessage(api, payload, threadID) {
  const msg = typeof payload === 'string' ? { body: payload } : { ...payload };
  if (msg.attachment && typeof msg.attachment === 'string') {
    try {
      if (fs.existsSync(msg.attachment)) msg.attachment = fs.createReadStream(msg.attachment);
    } catch (_) { /* URL distante : envoyée telle quelle */ }
  }
  return new Promise((resolve, reject) => {
    try {
      api.sendMessage(msg, String(threadID), (err, info) => (err ? reject(normalizeError(err)) : resolve(info || { messageID: null })));
    } catch (e) {
      reject(normalizeError(e));
    }
  });
}

/** Cache d'infos utilisateurs (nom, photo) — TTL 10 min. */
class UserInfoCache {
  constructor(api, logger) {
    this.api = api;
    this.logger = logger;
    this.cache = new Map(); // uid → {name, thumbSrc, expiresAt}
    this.pending = new Map();
  }

  async fetch(ids) {
    const now = Date.now();
    const need = [];
    const out = {};
    for (const raw of ids) {
      const uid = String(raw);
      const hit = this.cache.get(uid);
      if (hit && hit.expiresAt > now) out[uid] = hit;
      else if (!this.pending.has(uid)) need.push(uid);
    }
    if (need.length > 0) {
      const task = this._fetchFresh(need).catch(() => ({}));
      for (const uid of need) this.pending.set(uid, task);
      const fresh = await task;
      for (const uid of need) this.pending.delete(uid);
      for (const [uid, info] of Object.entries(fresh)) {
        const rec = { name: (info && (info.name || info.fullName)) || 'Membre', thumbSrc: (info && info.thumbSrc) || null, expiresAt: Date.now() + 10 * 60 * 1000 };
        this.cache.set(String(uid), rec);
        out[String(uid)] = rec;
      }
    } else {
      for (const raw of ids) {
        const uid = String(raw);
        const hit = this.cache.get(uid);
        if (hit) out[uid] = hit;
      }
    }
    return out;
  }

  async _fetchFresh(ids) {
    if (typeof this.api.getUserInfo !== 'function') return {};
    const getInfo = promisify(this.api.getUserInfo.bind(this.api));
    const res = await getInfo(ids);
    return res && typeof res === 'object' ? res : {};
  }

  async get(uid) {
    const res = await this.fetch([uid]);
    return res[String(uid)] || { name: 'Membre', thumbSrc: null };
  }

  async getName(uid) {
    const info = await this.get(uid);
    return info.name || 'Membre';
  }
}

function detectCapabilities(api) {
  return {
    unsend: typeof api.unsend === 'function',
    removeUser: typeof api.removeUserFromThread === 'function',
    addUser: typeof api.addUserToGroup === 'function',
    changeNickname: typeof api.changeNickname === 'function',
    mentions: true,
    typing: typeof api.sendTypingIndicator === 'function',
    listen: Boolean(api.listenMqtt || api.listen),
  };
}

function registerListener(api, onEvent, logger) {
  const listenFn = api.listenMqtt || api.listen;
  if (typeof listenFn !== 'function') throw new Error('Aucun listener disponible sur cette API Messenger.');
  return listenFn.call(api, (err, event) => {
    if (err) {
      logger.warn('[facebook] listen:', typeof err === 'object' ? err.error || err.message : err);
      return;
    }
    if (event) {
      try {
        onEvent(event);
      } catch (e) {
        logger.error('[facebook] onEvent:', e.message);
      }
    }
  });
}

/* ──────────────────────────  Adapter ws3-fca  ────────────────────────── */

/*
 * Normalise un cookie quel que soit son format d'export :
 *  - « Cookie Editor » / éditeurs navigateurs : { name, value, domain, ... }
 *  - format FCA classique (api.getAppState())  : { key, value, domain, ... }
 * Renvoie un cookie au format FCA { key, value, domain, path, ... }.
 */
function normalizeCookie(cookie) {
  if (!cookie || typeof cookie !== 'object') return null;
  const out = { ...cookie };
  if (out.key == null && out.name != null) out.key = out.name;
  delete out.name;
  if (out.key == null || out.value == null) return null;
  if (typeof out.value !== 'string') out.value = String(out.value);
  // tough-cookie (utilisé par ws3-fca) attend des valeurs sameSite spécifiques
  const sameSiteMap = { no_restriction: 'none', unspecified: 'unspecified', lax: 'lax', strict: 'strict' };
  if (out.sameSite && sameSiteMap[out.sameSite]) out.sameSite = sameSiteMap[out.sameSite];
  return out;
}

/*
 * Lit l'état Facebook (cookies) et le normalise.
 * Sources acceptées (dans cet ordre) :
 *   1. config.appstateJson  → variable APPSTATE_JSON (JSON complet, une ligne)
 *   2. config.appstateFile  → fichier appstate.json à la racine du projet
 */
function readAppState(config) {
  let raw = null;
  if (config.appstateJson && String(config.appstateJson).trim()) {
    raw = JSON.parse(config.appstateJson);
  } else {
    const file = path.isAbsolute(config.appstateFile) ? config.appstateFile : path.join(config.root, config.appstateFile);
    if (!fs.existsSync(file)) {
      throw new Error(
        `Aucun appstate trouvé (${file}). Fournis un fichier appstate.json (cookies Facebook) ou la variable APPSTATE_JSON.`
      );
    }
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  // Certains exports enveloppent les cookies : {"cookies":[...]}
  if (raw && !Array.isArray(raw) && Array.isArray(raw.cookies)) raw = raw.cookies;
  if (!Array.isArray(raw)) {
    throw new Error('appstate invalide : un tableau de cookies est attendu (export Cookie Editor ou getAppState).');
  }
  const state = raw.map(normalizeCookie).filter(Boolean);
  const keys = new Set(state.map((c) => c.key));
  const missing = ['c_user', 'xs'].filter((k) => !keys.has(k));
  if (missing.length > 0) {
    throw new Error(
      `appstate incomplet : cookies essentiels manquants (${missing.join(', ')}). ` +
        'Connecte le COMPTE BOT sur facebook.com dans ton navigateur puis réexporte tous les cookies.'
    );
  }
  return state;
}

async function createWs3Adapter(config, logger, { onEvent } = {}) {
  /*
   * Extraction robuste de la fonction login — les forks FCA n'exportent pas
   * tous de la même façon :
   *   ws3-fca  : module.exports = { login }
   *   fca-*    : module.exports = login (fonction directe)
   *   ESM      : { default: login }
   */
  let login;
  try {
    // eslint-disable-next-line global-require
    const mod = require('ws3-fca');
    if (typeof mod === 'function') login = mod;
    else if (mod && typeof mod.login === 'function') login = mod.login;
    else if (mod && typeof mod.default === 'function') login = mod.default;
  } catch (err) {
    throw new Error('Dépendance ws3-fca manquante — lance « npm install ».');
  }
  if (typeof login !== 'function') {
    throw new Error('ws3-fca : fonction « login » introuvable dans le module (export inattendu).');
  }
  const appState = readAppState(config);
  const options = {
    online: true,
    updatePresence: true,
    selfListen: false, // le bot ne s'écoute pas lui-même
    autoMarkRead: false,
    autoMarkDelivery: false,
  };
  const api = await new Promise((resolve, reject) => {
    login({ appState }, options, (err, fbApi) => (err ? reject(normalizeError(err, 'FB_LOGIN_FAILED')) : resolve(fbApi)));
  });

  const capabilities = detectCapabilities(api);
  const userCache = new UserInfoCache(api, logger);

  let stopListener = null;
  if (onEvent) {
    try {
      stopListener = registerListener(api, onEvent, logger);
    } catch (err) {
      logger.error('[facebook] listener:', err.message);
    }
  }

  logger.info('[facebook] connecté (ws3-fca). Capacités:', capabilities);
  return {
    mode: 'ws3-fca',
    api,
    botID: api.getCurrentUserID ? String(api.getCurrentUserID()) : '',
    capabilities,
    userCache,
    send: (payload, threadID) => sendMessage(api, payload, threadID),
    getThreadInfo: async (threadID) => {
      if (typeof api.getThreadInfo !== 'function') return null;
      return promisify(api.getThreadInfo.bind(api))(String(threadID));
    },
    changeNickname: async (nickname, threadID, userID) => {
      if (!capabilities.changeNickname) throw Object.assign(new Error('NON_DISPONIBLE'), { code: 'FB_CAP_UNAVAILABLE' });
      return promisify(api.changeNickname.bind(api))(nickname, String(threadID), String(userID));
    },
    unsend: async (messageID) => {
      if (!capabilities.unsend) throw Object.assign(new Error('NON_DISPONIBLE'), { code: 'FB_CAP_UNAVAILABLE' });
      return promisify(api.unsend.bind(api))(String(messageID));
    },
    removeUser: async (userID, threadID) => {
      if (!capabilities.removeUser) throw Object.assign(new Error('NON_DISPONIBLE'), { code: 'FB_CAP_UNAVAILABLE' });
      return promisify(api.removeUserFromThread.bind(api))(String(userID), String(threadID));
    },
    addUser: async (userID, threadID) => {
      if (!capabilities.addUser) throw Object.assign(new Error('NON_DISPONIBLE'), { code: 'FB_CAP_UNAVAILABLE' });
      return promisify(api.addUserToGroup.bind(api))(String(userID), String(threadID));
    },
    shutdown: async () => {
      if (stopListener) stopListener();
    },
  };
}

/* ──────────────────────────  Adapter mock (tests/dev)  ────────────────────────── */

function createMockAdapter(config, logger, { onEvent, mockUsers, mockFailures } = {}) {
  const seq = { n: 0 };
  const sent = [];
  const users = Object.assign(
    {
      '61569333774600': { name: 'Admin Principal', thumbSrc: null, vanity: null },
      '100065927401614': { name: 'Propriétaire', thumbSrc: null, vanity: null },
      '111111111111111': { name: 'Shadow', thumbSrc: null, vanity: null },
      '222222222222222': { name: 'Paul', thumbSrc: null, vanity: null },
      '333333333333333': { name: 'Fortiche', thumbSrc: null, vanity: null },
      '444444444444444': { name: 'Spammer', thumbSrc: null, vanity: null },
    },
    mockUsers || {}
  );
  const nicknames = [];
  const unsent = [];
  const removed = [];
  const added = [];
  const failures = Object.assign({ removeUser: true, addUser: false }, mockFailures || {});
  // Par défaut : removeUser échoue (réalité Messenger), addUser réussit.

  const api = {
    getCurrentUserID: () => 'BOT_MOCK_000000',
    sendMessage: (payload, threadID, cb) => {
      const id = `mock-m${++seq.n}`;
      sent.push({ id, threadID: String(threadID), payload: typeof payload === 'string' ? { body: payload } : payload });
      setImmediate(() => cb(null, { messageID: id }));
    },
    getUserInfo: (ids, cb) => {
      const arr = Array.isArray(ids) ? ids : [ids];
      const out = {};
      for (const id of arr) {
        const u = users[String(id)];
        if (u) out[String(id)] = { name: u.name, thumbSrc: u.thumbSrc || null, profileUrl: '', vanity: null };
      }
      setImmediate(() => cb(null, out));
    },
    getThreadInfo: (threadID, cb) => {
      const done = typeof cb === 'function' ? cb : () => {};
      setImmediate(() =>
        done(null, {
          threadID: String(threadID),
          threadName: 'Groupe Test',
          userInfo: Object.entries(users).map(([id, u]) => ({ id, name: u.name })),
          adminIDs: ['61569333774600'],
          participantIDs: Object.keys(users),
        })
      );
    },
    changeNickname: (nickname, threadID, userID, cb) => {
      nicknames.push({ nickname, threadID: String(threadID), userID: String(userID) });
      setImmediate(() => cb(null));
    },
    unsend: (messageID, cb) => {
      unsent.push(String(messageID));
      setImmediate(() => cb(null));
    },
    removeUserFromThread: (userID, threadID, cb) => {
      if (failures.removeUser) {
        setImmediate(() => cb({ error: 'Not authorized — les bots ne peuvent pas expulser des membres.' }));
        return;
      }
      removed.push(String(userID));
      setImmediate(() => cb(null));
    },
    addUserToGroup: (userID, threadID, cb) => {
      if (failures.addUser) {
        setImmediate(() => cb({ error: 'Cannot add user' }));
        return;
      }
      added.push(String(userID));
      setImmediate(() => cb(null, true));
    },
  };

  const adapter = {
    mode: 'mock',
    api,
    botID: 'BOT_MOCK_000000',
    capabilities: detectCapabilities(api),
    userCache: new UserInfoCache(api, logger),
    send: (payload, threadID) => sendMessage(api, payload, threadID),
    getThreadInfo: async (threadID) =>
      new Promise((resolve) => api.getThreadInfo(threadID, (e, info) => resolve(e ? null : info))),
    changeNickname: async (nickname, threadID, userID) =>
      new Promise((resolve, reject) => api.changeNickname(nickname, threadID, userID, (e) => (e ? reject(normalizeError(e)) : resolve()))),
    unsend: async (messageID) => new Promise((resolve, reject) => api.unsend(messageID, (e) => (e ? reject(normalizeError(e)) : resolve()))),
    removeUser: async (userID, threadID) =>
      new Promise((resolve, reject) => api.removeUserFromThread(userID, threadID, (e) => (e ? reject(normalizeError(e)) : resolve()))),
    addUser: async (userID, threadID) =>
      new Promise((resolve, reject) => api.addUserToGroup(userID, threadID, (e) => (e ? reject(normalizeError(e)) : resolve()))),
    shutdown: async () => {},
    /* Observateurs pour les tests */
    sent,
    nicknames,
    unsent,
    removed,
    added,
    mockUsers: users,
    inject: (event) => onEvent && onEvent(event),
  };
  return adapter;
}

async function connect(config, logger, hooks = {}) {
  if (config.adapter === 'mock') return createMockAdapter(config, logger, hooks);
  return createWs3Adapter(config, logger, hooks);
}

module.exports = { connect, sendMessage, UserInfoCache, detectCapabilities, readAppState, normalizeCookie };
