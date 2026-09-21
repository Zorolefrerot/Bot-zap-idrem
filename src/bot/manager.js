import { EventEmitter } from 'node:events';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { WA_STATUS } from '../config/defaults.js';
import env from '../config/env.js';
import db from '../database/index.js';
import { AUTH_DIR, clearAuthState, hasStoredCredentials } from '../auth/sessionStore.js';
import { requestPairCode, PAIR_CODE_TTL_MS } from '../auth/pairing.js';
import * as sessions from '../auth/sessionId.js';
import { createLogger } from '../utils/logger.js';
import { normalizePhone, jidToPhone, isSameJid } from '../utils/phone.js';
import { formatPhone, maskPhone } from '../utils/format.js';
import { ApiError, BotError } from '../utils/errors.js';
import { createWhatsAppClient, DisconnectReason } from './client.js';
import { registerBotEvents } from '../events/index.js';
import { registerMessageHandler } from './handler.js';
import { loadCommands } from './loader.js';

const logger = createLogger('bot-manager');

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30_000;
const NETWORK_ERROR_PATTERN = /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|socket hang up|socket disconnected|network|TLS/i;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Orchestrateur unique du bot WhatsApp.
 * Gère : appairage, cycle de vie de la connexion, Session ID, état public.
 */
export class BotManager extends EventEmitter {
  #reconnectAttempts = 0;
  #timers = new Set();
  #closing = false;
  #intendedClose = false;
  #busy = null;

  constructor() {
    super();
    this.setMaxListeners(20);

    this.sock = null;
    this.status = WA_STATUS.IDLE;
    this.bootedAt = Date.now();
    this.connectedAt = null;
    this.closedAt = null;

    this.phone = null;
    this.jid = null;
    this.pushName = null;

    this.pairCode = null;
    this.qr = null;
    this.lastError = null;
    this.sessionId = null;

    this.commands = new Map();
    this.commandAliases = new Map();
    this.commandErrors = [];

    this.#reconnectAttempts = 0;
    this.#timers = new Set();
    this.#closing = false;
    this.#intendedClose = false;
    this.#busy = null;
  }

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                            */
  /* ------------------------------------------------------------------ */

  async boot() {
    const loaded = await loadCommands();
    this.commands = loaded.commands;
    this.commandAliases = loaded.aliases;
    this.commandErrors = loaded.errors;
    logger.info('commandes chargées', { total: this.commands.size, aliases: this.commandAliases.size });

    const hasCredentials = await hasStoredCredentials(AUTH_DIR);
    const active = db.getActiveSession();
    if (active && !active.revoked) this.sessionId = active.id;

    if (hasCredentials && env.whatsapp.autoReconnect) {
      logger.info('session stockée détectée : reconnexion sans nouveau Pair Code', {
        session: this.sessionId ? 'active' : 'inconnue',
      });
      this.status = WA_STATUS.CONNECTING;
      await this.connect({ reason: 'boot' }).catch((error) => {
        logger.warn('reconnexion au démarrage échouée', { reason: error.message });
      });
    } else {
      this.status = WA_STATUS.IDLE;
      logger.info('aucune session exploitable : en attente d’un Pair Code');
    }

    return this;
  }

  /* ------------------------------------------------------------------ */
  /* Appairage                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Lance un nouvel appairage : efface les credentials précédents, ouvre une
   * connexion neuve et demande un Pair Code au serveur WhatsApp.
   */
  async pair({ phoneNumber, adminNumber, adminName, prefix, stickerName, stickerAuthor, botName } = {}) {
    const phone = normalizePhone(phoneNumber);
    if (!phone) throw ApiError.badRequest('Numéro WhatsApp invalide (format international attendu, ex. 243970000000).');

    const settingsPatch = {};
    if (adminNumber) settingsPatch.adminNumber = adminNumber;
    if (adminName) settingsPatch.adminName = adminName;
    if (prefix) settingsPatch.prefix = prefix;
    if (stickerName) settingsPatch.stickerName = stickerName;
    if (stickerAuthor) settingsPatch.stickerAuthor = stickerAuthor;
    if (botName) settingsPatch.botName = botName;
    if (Object.keys(settingsPatch).length) db.updateSettings(settingsPatch);

    return this.#withLock('pair', async () => {
      await this.#teardown({ logout: false, reason: 'new-pairing' });

      // Nouvel appairage => nouvelle identité : credentials et session remis à zéro.
      await clearAuthState(AUTH_DIR);
      const previous = db.getActiveSessionId();
      if (previous) sessions.revokeSession(previous, 'replaced-by-new-pairing');
      this.sessionId = null;

      this.phone = phone;
      this.jid = null;
      this.pushName = null;
      this.pairCode = null;
      this.qr = null;
      this.lastError = null;
      this.#reconnectAttempts = 0;
      this.status = WA_STATUS.PAIRING;
      this.emit('status', this.getStatus());

      try {
        await this.#createSocket();
        const { code, display } = await requestPairCode(this.sock, phone);
        const now = Date.now();
        this.pairCode = {
          display,
          phone,
          generatedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + PAIR_CODE_TTL_MS).toISOString(),
        };
        // Le code brut reste côté serveur : seule la forme affichable est renvoyée.
        logger.info('pair code prêt', { phone: maskPhone(phone) });
        this.emit('pair', { display, phone, expiresAt: this.pairCode.expiresAt });
        this.emit('status', this.getStatus());
        return { pairCode: display, code, phone, expiresAt: this.pairCode.expiresAt };
      } catch (error) {
        // On referme proprement la tentative pour ne pas laisser de socket zombie.
        await this.#teardown({ logout: false, reason: 'pair-failed' }).catch(() => {});

        const reason = error?.message || 'erreur inconnue';
        this.lastError = reason;
        this.status = WA_STATUS.ERROR;
        logger.error('génération du Pair Code échouée', { reason });
        this.emit('status', this.getStatus());

        if (error instanceof ApiError) throw error;
        if (error instanceof BotError) throw ApiError.unavailable(error.message);
        if (NETWORK_ERROR_PATTERN.test(reason)) {
          throw ApiError.unavailable(
            'Serveurs WhatsApp injoignables depuis ce serveur (connexion WebSocket sortante bloquée ou réseau indisponible). ' +
              'Vérifiez la connectivité sortante sur le port 443 puis réessayez.',
          );
        }
        throw ApiError.unavailable(`Impossible d’obtenir le Pair Code : ${reason}`);
      }
    });
  }

  /** Reconnexion avec les credentials existants (aucun Pair Code nécessaire). */
  async connect({ reason = 'manual' } = {}) {
    const hasCredentials = await hasStoredCredentials(AUTH_DIR);
    if (!hasCredentials) {
      this.status = WA_STATUS.WAITING;
      throw ApiError.conflict('Aucune session enregistrée : générez d’abord un Pair Code.');
    }

    return this.#withLock('connect', async () => {
      await this.#teardown({ logout: false, reason: `reconnect:${reason}` });
      this.#reconnectAttempts = 0;
      this.lastError = null;
      this.status = WA_STATUS.CONNECTING;
      this.emit('status', this.getStatus());
      await this.#createSocket();
      return { status: this.status, reason };
    });
  }

  async reconnect() {
    return this.connect({ reason: 'user' });
  }

  /**
   * Déconnexion.
   * `logout: true` retire aussi le device de WhatsApp (nouveau pairing requis).
   */
  async disconnect({ logout = true } = {}) {
    return this.#withLock('disconnect', async () => {
      const active = db.getActiveSession();
      if (logout && this.sock?.user) {
        try {
          await this.sock.logout();
        } catch (error) {
          logger.warn('logout WhatsApp échoué, fermeture locale uniquement', { reason: error.message });
        }
      }

      await this.#teardown({ logout, reason: logout ? 'logout' : 'disconnect' });

      if (logout) {
        await clearAuthState(AUTH_DIR);
        if (active) sessions.revokeSession(active.id, 'user-disconnect');
        this.sessionId = null;
        this.phone = null;
        this.jid = null;
        this.pushName = null;
        this.status = WA_STATUS.IDLE;
      } else {
        this.status = WA_STATUS.DISCONNECTED;
      }

      this.emit('status', this.getStatus());
      return { status: this.status, loggedOut: logout };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Session ID                                                           */
  /* ------------------------------------------------------------------ */

  regenerateSession() {
    const activeId = this.sessionId || db.getActiveSessionId();
    if (!activeId || !this.isConnected()) {
      throw ApiError.conflict('Aucune session connectée : générez d’abord un Pair Code.');
    }
    const next = sessions.regenerateSession(activeId);
    if (!next) throw ApiError.notFound('Session introuvable.');
    this.sessionId = next.id;
    this.emit('session', sessions.toPublicSession(next));
    this.emit('status', this.getStatus());
    return sessions.toPublicSession(next);
  }

  getPublicSession() {
    const session = db.getActiveSession();
    return sessions.toPublicSession(session);
  }

  /* ------------------------------------------------------------------ */
  /* Internes                                                             */
  /* ------------------------------------------------------------------ */

  /** Sérialise les opérations sensibles (pair / connect / disconnect). */
  #withLock(operation, task) {
    const previous = this.#busy || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    this.#busy = current;

    return previous
      .catch(() => {})
      .then(() => {
        logger.debug('opération verrouillée', { operation });
        return task();
      })
      .finally(() => {
        release();
        if (this.#busy === current) this.#busy = null;
      });
  }

  async #createSocket() {
    const { sock } = await createWhatsAppClient({ authDir: AUTH_DIR });
    this.sock = sock;
    this.#closing = false;

    registerBotEvents(sock, this);
    registerMessageHandler(sock, this);
    return sock;
  }

  /** Ferme proprement la connexion courante et annule les retries programmés. */
  async #teardown({ logout = false, reason = 'teardown' } = {}) {
    this.#intendedClose = true;
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();

    const sock = this.sock;
    this.sock = null;
    if (!sock) return;

    try {
      sock.ev.removeAllListeners();
      if (sock.ws?.readyState === 1) {
        await Promise.race([
          sock.end(logout ? new Boom('Intentional Logout', { statusCode: DisconnectReason.loggedOut }) : undefined),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      }
    } catch (error) {
      logger.debug('fermeture du socket', { reason: error.message });
    } finally {
      this.#closing = true;
      this.connectedAt = null;
      logger.info('connexion fermée', { reason });
    }
  }

  /** Appelé par les événements Baileys. */
  handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update || {};

    if (qr) {
      this.status = WA_STATUS.WAITING;
      QRCode.toDataURL(String(qr))
        .then((dataUrl) => {
          this.qr = { dataUrl, generatedAt: new Date().toISOString() };
          this.emit('qr', this.qr);
          this.emit('status', this.getStatus());
        })
        .catch(() => {});
      return;
    }

    if (connection === 'connecting') {
      if (this.status !== WA_STATUS.PAIRING) this.status = WA_STATUS.CONNECTING;
      this.emit('status', this.getStatus());
      return;
    }

    if (connection === 'open') {
      this.#onConnected().catch((error) => logger.error('post-connexion échouée', { reason: error.message }));
      return;
    }

    if (connection === 'close') {
      this.#onClosed(lastDisconnect);
    }
  }

  async #onConnected() {
    this.#reconnectAttempts = 0;
    this.#intendedClose = false;
    this.connectedAt = Date.now();
    this.closedAt = null;
    this.lastError = null;
    this.qr = null;

    const me = this.sock?.user;
    if (me?.id) {
      this.jid = me.id;
      this.phone = jidToPhone(me.id) || this.phone;
      this.pushName = me.name || me.notify || null;
    }

    // Session ID générée automatiquement à la connexion, ou réutilisée si valide.
    let session = db.getActiveSession();
    if (!session || session.revoked) {
      session = sessions.createSession({ phone: this.phone, jid: this.jid, authDir: AUTH_DIR });
    }
    sessions.markConnected(session.id, { phone: this.phone, jid: this.jid });
    this.sessionId = session.id;
    this.status = WA_STATUS.CONNECTED;

    db.updateSettings({}); // déclenche une écriture disque
    logger.info('WhatsApp connecté', { phone: maskPhone(this.phone), session: sessions.sessionFingerprint(session.id) });

    this.emit('session', sessions.toPublicSession(session));
    this.emit('connected', { phone: this.phone, jid: this.jid });
    this.emit('status', this.getStatus());
  }

  #onClosed(lastDisconnect) {
    this.connectedAt = null;
    this.closedAt = Date.now();

    const statusCode = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    if (this.#intendedClose) {
      this.emit('status', this.getStatus());
      return;
    }

    if (loggedOut) {
      logger.warn('déconnexion depuis le téléphone : credentials révoqués');
      this.status = WA_STATUS.LOGGED_OUT;
      this.lastError = 'Session fermée depuis WhatsApp (Appareils connectés). Générez un nouveau Pair Code.';
      const active = db.getActiveSessionId();
      if (active) sessions.revokeSession(active, 'logged-out');
      this.sessionId = null;
      clearAuthState(AUTH_DIR).catch(() => {});
      this.emit('status', this.getStatus());
      return;
    }

    this.status = this.pairCode && !db.getActiveSession() ? WA_STATUS.PAIRING : WA_STATUS.DISCONNECTED;
    this.lastError = statusCode ? `Connexion interrompue (code ${statusCode}).` : 'Connexion interrompue.';
    this.emit('status', this.getStatus());

    if (!env.whatsapp.autoRetry) return;

    const attempt = ++this.#reconnectAttempts;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      this.lastError = `Reconnexion abandonnée après ${MAX_RECONNECT_ATTEMPTS} tentatives. Utilisez « Reconnect » ou générez un nouveau Pair Code.`;
      logger.error('reconnexion abandonnée', { attempts: attempt });
      this.emit('status', this.getStatus());
      return;
    }

    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(attempt - 1, 5));
    logger.info('reconnexion programmée', { attempt, delayMs: delay, statusCode });

    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      // Inutile de réessayer sans credentials : un nouveau Pair Code est requis.
      hasStoredCredentials(AUTH_DIR)
        .then((stored) => (stored ? this.connect({ reason: `auto-retry-${attempt}` }) : null))
        .catch((error) => logger.warn('reconnexion automatique échouée', { reason: error.message }));
    }, delay);
    this.#timers.add(timer);
    if (timer.unref) timer.unref();
  }

  isConnected() {
    return this.status === WA_STATUS.CONNECTED && Boolean(this.sock?.user);
  }

  /**
   * Vérifie si un JID correspond à l'administrateur configuré.
   * Sécurité anti-verrouillage : si aucun ADMIN_NUMBER n'est défini,
   * le numéro WhatsApp auquel le bot est connecté est considéré owner.
   */
  isOwner(jid) {
    const { adminNumber } = db.getSettings();
    if (!jid) return false;

    const targetPhone = normalizePhone(jidToPhone(jid));
    if (!targetPhone) return false;

    const owners = String(adminNumber || '')
      .split(/[,;/\s]+/)
      .map((value) => normalizePhone(value))
      .filter(Boolean);

    if (!owners.length) {
      const selfPhone = normalizePhone(jidToPhone(this.jid || ''));
      return Boolean(selfPhone && selfPhone === targetPhone);
    }

    return owners.some((owner) => owner === targetPhone);
  }

  isSelf(jid) {
    return Boolean(this.jid && isSameJid(jid, this.jid));
  }

  /** État public exposé par l'API (aucune donnée sensible). */
  getStatus() {
    const settings = db.getSettings();
    const stats = db.getStats();
    const session = this.getPublicSession();
    const categories = new Map();
    for (const command of this.commands.values()) {
      categories.set(command.category, (categories.get(command.category) || 0) + 1);
    }

    return {
      project: env.projectName,
      bot: {
        name: settings.botName,
        prefix: settings.prefix,
        stickerName: settings.stickerName,
        stickerAuthor: settings.stickerAuthor,
      },
      whatsapp: {
        status: this.status,
        connected: this.isConnected(),
        phone: this.phone || null,
        phoneFormatted: this.phone ? formatPhone(this.phone) : null,
        jid: this.jid ? jidToPhone(this.jid) : null,
        pushName: this.pushName || null,
        connectedAt: this.connectedAt ? new Date(this.connectedAt).toISOString() : null,
        closedAt: this.closedAt ? new Date(this.closedAt).toISOString() : null,
        uptimeMs: this.connectedAt ? Date.now() - this.connectedAt : 0,
      },
      admin: {
        name: settings.adminName || null,
        number: settings.adminNumber ? formatPhone(settings.adminNumber) : null,
        configured: Boolean(settings.adminNumber),
      },
      pair: this.pairCode
        ? {
            display: this.pairCode.display,
            phone: formatPhone(this.pairCode.phone),
            generatedAt: this.pairCode.generatedAt,
            expiresAt: this.pairCode.expiresAt,
            expired: Date.now() > new Date(this.pairCode.expiresAt).getTime(),
          }
        : null,
      qr: this.qr ? { generatedAt: this.qr.generatedAt } : null,
      session: session
        ? {
            ...session,
            state: this.isConnected() ? 'connected' : session.revoked ? 'revoked' : 'stored',
          }
        : { sessionId: null, state: 'none' },
      commands: {
        total: this.commands.size,
        byCategory: Object.fromEntries(categories),
      },
      stats,
      server: {
        startedAt: new Date(this.bootedAt).toISOString(),
        uptimeMs: Date.now() - this.bootedAt,
        node: process.version,
        env: env.nodeEnv,
      },
      error: this.lastError,
    };
  }

  /** Liste publique des commandes (métadonnées uniquement). */
  listCommands() {
    return [...this.commands.values()]
      .map((command) => ({
        name: command.name,
        aliases: command.aliases || [],
        category: command.category,
        description: command.description,
        usage: command.usage || `${db.getSettings().prefix}${command.name}`,
        examples: command.examples || [],
        ownerOnly: Boolean(command.ownerOnly),
        adminOnly: Boolean(command.adminOnly),
        groupOnly: Boolean(command.groupOnly),
        privateOnly: Boolean(command.privateOnly),
        usesMedia: Boolean(command.usesMedia),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Résout un nom de commande ou un alias. */
  resolveCommand(token) {
    const key = String(token || '').trim().toLowerCase();
    if (!key) return null;
    if (this.commands.has(key)) return this.commands.get(key);
    const target = this.commandAliases.get(key);
    return target ? this.commands.get(target) || null : null;
  }

  async shutdown() {
    await this.#teardown({ logout: false, reason: 'shutdown' });
    await db.flush();
  }
}

export const botManager = new BotManager();
export default botManager;
