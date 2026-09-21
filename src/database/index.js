import path from 'node:path';
import env from '../config/env.js';
import { DEFAULTS } from '../config/defaults.js';
import { isGroupJid, isSameJid, jidToPhone } from '../utils/phone.js';
import { createLogger } from '../utils/logger.js';
import { JsonStore } from './jsonStore.js';

const logger = createLogger('database');

const SCHEMA_VERSION = 1;

const defaultState = () => ({
  version: SCHEMA_VERSION,
  meta: {
    instanceId: null,
    createdAt: null,
  },
  settings: {
    botName: env.botDefaults.botName || DEFAULTS.botName,
    prefix: env.botDefaults.prefix || DEFAULTS.prefix,
    stickerName: env.botDefaults.stickerName || DEFAULTS.stickerName,
    stickerAuthor: env.botDefaults.stickerAuthor || DEFAULTS.stickerAuthor,
    adminNumber: env.botDefaults.adminNumber || DEFAULTS.adminNumber,
    adminName: env.botDefaults.adminName || DEFAULTS.adminName,
    autoReconnect: env.whatsapp.autoReconnect,
  },
  session: {
    activeId: null,
    registry: {},
  },
  chats: {},
  stats: {
    startedAt: null,
    messagesProcessed: 0,
    commandsExecuted: 0,
    byCommand: {},
  },
});

class Database {
  constructor(file = path.join(env.paths.data, 'db.json')) {
    this.store = new JsonStore(file, defaultState());
    this.ready = false;
  }

  async init() {
    if (this.ready) return this;
    await this.store.load();

    const meta = this.store.get('meta') || {};
    if (!meta.instanceId) {
      meta.instanceId = `idrem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!meta.createdAt) meta.createdAt = new Date().toISOString();
    this.store.set('meta', meta);

    this.stats = this.store.get('stats');
    if (!this.stats.startedAt) {
      this.stats.startedAt = new Date().toISOString();
      this.store.set('stats', this.stats);
    }

    await this.store.flush();
    this.ready = true;
    logger.info('base initialisée', { file: path.basename(this.store.file), instance: meta.instanceId });
    return this;
  }

  /* ------------------------------------------------------------------ */
  /* Paramètres du bot                                                    */
  /* ------------------------------------------------------------------ */

  getSettings() {
    const settings = this.store.get('settings') || {};
    return {
      botName: settings.botName || DEFAULTS.botName,
      prefix: settings.prefix || DEFAULTS.prefix,
      stickerName: settings.stickerName || DEFAULTS.stickerName,
      // L'auteur des stickers retombe sur le nom de l'administrateur.
      stickerAuthor: settings.stickerAuthor || settings.adminName || DEFAULTS.stickerAuthor,
      stickerAuthorExplicit: Boolean(settings.stickerAuthor),
      adminNumber: settings.adminNumber || '',
      adminName: settings.adminName || '',
      autoReconnect: settings.autoReconnect !== false,
    };
  }

  updateSettings(patch = {}) {
    const current = this.store.get('settings') || {};
    const next = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      next[key] = value;
    }
    this.store.set('settings', next);
    return this.getSettings();
  }

  /* ------------------------------------------------------------------ */
  /* Sessions (références vers les credentials WhatsApp)                  */
  /* ------------------------------------------------------------------ */

  registerSession(entry) {
    const registry = this.store.get('session')?.registry || {};
    registry[entry.id] = {
      id: entry.id,
      phone: entry.phone || null,
      jid: entry.jid || null,
      authDir: entry.authDir,
      createdAt: entry.createdAt || new Date().toISOString(),
      connectedAt: entry.connectedAt || null,
      lastSeenAt: entry.lastSeenAt || null,
      revoked: false,
      revokeReason: null,
    };
    this.store.set('session', { ...this.store.get('session'), registry });
    return registry[entry.id];
  }

  updateSession(id, patch = {}) {
    const session = this.store.get('session');
    const entry = session?.registry?.[id];
    if (!entry) return null;
    session.registry[id] = { ...entry, ...patch, id };
    this.store.set('session', { ...session });
    return session.registry[id];
  }

  getSession(id) {
    if (!id) return null;
    return this.store.get('session')?.registry?.[id] || null;
  }

  listSessions() {
    return Object.values(this.store.get('session')?.registry || {}).sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    );
  }

  getActiveSessionId() {
    return this.store.get('session')?.activeId || null;
  }

  getActiveSession() {
    const id = this.getActiveSessionId();
    return id ? this.getSession(id) : null;
  }

  setActiveSession(id) {
    const session = this.store.get('session') || { activeId: null, registry: {} };
    this.store.set('session', { ...session, activeId: id || null });
    return this.getActiveSession();
  }

  /** Révoque une Session ID sans supprimer les credentials. */
  revokeSession(id, reason = 'revoked') {
    const entry = this.getSession(id);
    if (!entry) return null;
    const updated = this.updateSession(id, { revoked: true, revokeReason: reason, revokedAt: new Date().toISOString() });
    if (this.getActiveSessionId() === id) this.setActiveSession(null);
    return updated;
  }

  /** Rotation : nouvelle Session ID pointant vers les mêmes credentials. */
  rotateSession(currentId) {
    const current = this.getSession(currentId);
    if (!current) return null;
    this.revokeSession(currentId, 'rotated');
    return { previous: current, authDir: current.authDir, phone: current.phone, jid: current.jid };
  }

  /* ------------------------------------------------------------------ */
  /* Conversations (métadonnées uniquement : aucun contenu de message)     */
  /* ------------------------------------------------------------------ */

  trackChat({ jid, name, isGroup, pushName }) {
    if (!jid || jid === 'status@broadcast' || jid.endsWith('@broadcast')) return null;
    const chats = this.store.get('chats') || {};
    const existing = chats[jid] || { jid, firstSeenAt: new Date().toISOString(), messageCount: 0 };
    chats[jid] = {
      ...existing,
      name: name || existing.name || (isGroup ? undefined : pushName) || existing.name || null,
      isGroup: Boolean(isGroup),
      messageCount: (existing.messageCount || 0) + 1,
      lastInteraction: new Date().toISOString(),
    };
    this.store.set('chats', chats);
    return chats[jid];
  }

  /** Oublie les conversations suivies (métadonnées uniquement). */
  clearChats() {
    this.store.set('chats', {});
    return 0;
  }

  listChats({ limit = 200 } = {}) {
    return Object.values(this.store.get('chats') || {})
      .sort((a, b) => String(b.lastInteraction).localeCompare(String(a.lastInteraction)))
      .slice(0, limit);
  }

  broadcastTargets({ target = 'all' } = {}) {
    const chats = this.listChats({ limit: 5000 });
    if (target === 'groups') return chats.filter((c) => c.isGroup);
    if (target === 'private') return chats.filter((c) => !c.isGroup);
    return chats;
  }

  /* ------------------------------------------------------------------ */
  /* Statistiques                                                         */
  /* ------------------------------------------------------------------ */

  incrementMessages(count = 1) {
    this.store.update('stats', (s) => ({ ...s, messagesProcessed: (s.messagesProcessed || 0) + count }));
  }

  incrementCommand(name) {
    this.store.update('stats', (s) => ({
      ...s,
      commandsExecuted: (s.commandsExecuted || 0) + 1,
      byCommand: { ...(s.byCommand || {}), [name]: (s.byCommand?.[name] || 0) + 1 },
    }));
  }

  getStats() {
    const stats = this.store.get('stats') || {};
    const session = this.getActiveSession();
    return {
      startedAt: stats.startedAt || null,
      messagesProcessed: stats.messagesProcessed || 0,
      commandsExecuted: stats.commandsExecuted || 0,
      topCommands: Object.entries(stats.byCommand || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count })),
      chats: Object.keys(this.store.get('chats') || {}).length,
      sessions: this.listSessions().length,
      connectedPhone: session?.phone || null,
    };
  }

  get meta() {
    return this.store.get('meta') || {};
  }

  async flush() {
    await this.store.flush();
  }

  async close() {
    await this.store.close();
  }
}

export const db = new Database();
export { Database, isGroupJid, isSameJid, jidToPhone };
export default db;
