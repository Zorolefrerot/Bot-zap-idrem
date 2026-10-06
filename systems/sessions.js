'use strict';
/*
 * 🧬 MeR~NeL — systems/sessions.js
 * Gestionnaire de conversations multi-étapes.
 * sessions[threadID][scope] — avec expiration automatique des sessions
 * abandonnées et isolation stricte entre joueurs/groupes.
 */

class SessionManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    /** Map<`${threadID}::${scope}`, session> */
    this.sessions = new Map();
    this._sweeper = setInterval(() => this.sweep(), 30 * 1000);
    if (this._sweeper.unref) this._sweeper.unref();
  }

  static key(threadID, scope) {
    return `${String(threadID)}::${String(scope)}`;
  }

  get(threadID, scope) {
    return this.sessions.get(SessionManager.key(threadID, scope)) || null;
  }

  add(session) {
    session.manager = this;
    this.sessions.set(SessionManager.key(session.threadID, session.scope), session);
    this._armInactivity(session);
    return session;
  }

  /** Une session de ce thread accepte-t-elle cet utilisateur ? */
  hasSessionFor(threadID, userID) {
    const prefix = `${String(threadID)}::`;
    for (const [key, session] of this.sessions) {
      if (!key.startsWith(prefix)) continue;
      if (typeof session.accepts === 'function' && session.accepts(userID)) return true;
    }
    return false;
  }

  remove(threadID, scope) {
    const key = SessionManager.key(threadID, scope);
    const session = this.sessions.get(key);
    if (session) {
      session._clearTimers();
      this.sessions.delete(key);
    }
  }

  /**
   * Tente de router un message vers une session existante du thread.
   * @returns {Promise<boolean>} true si le message a été consommé.
   */
  async route(threadID, userID, ctx) {
    for (const [key, session] of this.sessions) {
      if (!key.startsWith(`${String(threadID)}::`)) continue;
      if (typeof session.accepts === 'function' && !session.accepts(userID)) continue;
      let consumed = false;
      try {
        consumed = await session.handle(ctx);
      } catch (err) {
        this.logger.error('[sessions] erreur dans', key, err.message);
        consumed = true; // on évite que l'erreur se répète à chaque message
      }
      if (consumed) {
        this._armInactivity(session);
        return true;
      }
    }
    return false;
  }

  /** Expire les sessions sans activité. */
  sweep() {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (session.expiresAt && session.expiresAt <= now) {
        this.sessions.delete(key);
        try {
          session.expire && session.expire();
        } catch (err) {
          this.logger.error('[sessions] expire()', key, err.message);
        }
      }
    }
  }

  count() {
    return this.sessions.size;
  }

  _armInactivity(session) {
    session.expiresAt = Date.now() + (session.inactivityMs || this.config.games.stepTimeoutMs);
  }

  destroyAll() {
    for (const [, session] of this.sessions) {
      session._clearTimers();
      try { session.dispose && session.dispose('shutdown'); } catch (_) { /* */ }
    }
    this.sessions.clear();
  }
}

module.exports = { SessionManager };
