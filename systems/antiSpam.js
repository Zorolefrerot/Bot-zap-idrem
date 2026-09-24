'use strict';
/*
 * 🧬 MeR~NeL — systems/antiSpam.js  (v2 — avertissement + ban automatiques)
 * Sur chaque message de groupe, on garde les 5 derniers messages de
 * l'utilisateur. Déclencheurs :
 *   - 5 messages IDENTIQUES (fenêtre SPAM_TIME_WINDOW_MS) ;
 *   - OU 5 messages en moins de SPAM_FLOOD_WINDOW_MS (10 s par défaut).
 * → 1er cas  : avertissement « 1/2 » ;
 * → 2e cas   : BANNISSEMENT automatique (côté bot + expulsion API si possible).
 */

class AntiSpam {
  constructor(db, config, logger) {
    this.db = db;
    this.config = config;
    this.logger = logger;
    /** Map<`${threadID}::${userID}`, [{text, ts}]> */
    this.tracks = new Map();
    this._sweeper = setInterval(() => this.sweep(), 60 * 1000);
    if (this._sweeper.unref) this._sweeper.unref();
  }

  static key(threadID, userID) {
    return `${String(threadID)}::${String(userID)}`;
  }

  /**
   * Observe un message. Retourne null ou une action :
   *   { action: 'warn', warnings, warnLimit }
   *   { action: 'ban',  warnings }
   */
  observe(threadID, userID, text, now = Date.now()) {
    const key = AntiSpam.key(threadID, userID);
    let ring = this.tracks.get(key);
    if (!ring) {
      ring = [];
      this.tracks.set(key, ring);
    }
    const cfg = this.config.spam;
    const limit = Math.max(2, cfg.duplicateLimit); // 5 par défaut
    const cleanText = String(text || '').trim().toLowerCase();

    ring.push({ text: cleanText, ts: now });
    if (ring.length > limit * 2) ring.shift();
    if (ring.length < limit || !cleanText) return null;

    const recent = ring.slice(-limit);

    // 1) Répétition : N derniers messages identiques dans la fenêtre.
    const allSame = recent.every((m) => m.text === cleanText);
    const sameInWindow = now - recent[0].ts <= cfg.timeWindowMs;

    // 2) Flood : N messages en moins de floodWindowMs (peu importe le contenu).
    const floodInWindow = now - recent[0].ts <= cfg.floodWindowMs;

    if ((allSame && sameInWindow) || floodInWindow) {
      const kind = allSame && !floodInWindow ? 'duplicate' : floodInWindow && !allSame ? 'flood' : 'flood+duplicate';
      ring.length = 0; // purge : ne pas re-déclencher en boucle
      return this._punish(userID, kind);
    }
    return null;
  }

  _punish(userID, kind) {
    const cfg = this.config.spam;
    const user = this.db.ensureUser(userID);
    user.warnings += 1;
    const warnings = user.warnings;

    if (cfg.autoBan && warnings >= cfg.warnLimit) {
      user.warnings = 0;
      user.banned = true;
      user.bannedReason = 'spam';
      user.bannedAt = Date.now();
      this.db.users.save();
      this.db.bumpStat('warningsIssued');
      this.db.bumpStat('spamAutoBans');
      return { action: 'ban', warnings: cfg.warnLimit, kind };
    }

    this.db.users.save();
    this.db.bumpStat('warningsIssued');
    return { action: 'warn', warnings, warnLimit: cfg.warnLimit, kind };
  }

  isMuted(userID, now = Date.now()) {
    const user = this.db.getUser(userID);
    return Boolean(user && user.mutedUntil && user.mutedUntil > now);
  }

  /** Retire avertissements et bannissement bot d'un membre (Xunban). */
  unmute(userID) {
    const user = this.db.getUser(userID);
    if (!user) return false;
    user.mutedUntil = 0;
    user.warnings = 0;
    user.banned = false;
    this.db.users.save();
    return true;
  }

  sweep() {
    const now = Date.now();
    for (const [key, ring] of this.tracks) {
      while (ring.length && now - ring[0].ts > 5 * 60 * 1000) ring.shift();
      if (ring.length === 0) this.tracks.delete(key);
    }
  }
}

module.exports = { AntiSpam };
