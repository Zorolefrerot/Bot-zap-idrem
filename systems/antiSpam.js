'use strict';
/*
 * 🧬 MeR~NeL — systems/antiSpam.js
 * Détection de répétitions/flood + sanctions configurables.
 */

class AntiSpam {
  constructor(db, config, logger) {
    this.db = db;
    this.config = config;
    this.logger = logger;
    /** Map<`${threadID}::${userID}`, [{text, ts}]> */
    this.tracks = new Map();
    /** Map<key, lastWarnTs> — évite de spammer les avertissements. */
    this.lastPunish = new Map();
    this._sweeper = setInterval(() => this.sweep(), 60 * 1000);
    if (this._sweeper.unref) this._sweeper.unref();
  }

  static key(threadID, userID) {
    return `${String(threadID)}::${String(userID)}`;
  }

  /**
   * Observe un message. Retourne null ou une action :
   * { type: 'duplicate' | 'flood', warnings, mutedUntil }
   */
  observe(threadID, userID, text, now = Date.now()) {
    const key = AntiSpam.key(threadID, userID);
    let ring = this.tracks.get(key);
    if (!ring) {
      ring = [];
      this.tracks.set(key, ring);
    }
    const cfg = this.config.spam;
    const cleanText = String(text || '').trim().toLowerCase();

    ring.push({ text: cleanText, ts: now });
    if (ring.length > Math.max(cfg.duplicateLimit * 2, 10)) ring.shift();

    // Détection de répétition : N derniers messages identiques dans la fenêtre.
    const limit = Math.max(2, cfg.duplicateLimit);
    if (ring.length >= limit && cleanText) {
      const recent = ring.slice(-limit);
      const allSame = recent.every((m) => m.text === cleanText);
      const withinWindow = now - recent[0].ts <= cfg.timeWindowMs;
      if (allSame && withinWindow) {
        // On purge la fenêtre pour ne pas re-déclencher en boucle.
        ring.length = 0;
        return this._punish(threadID, userID, 'duplicate');
      }
    }
    return null;
  }

  _punish(threadID, userID, type) {
    const cfg = this.config.spam;
    const user = this.db.ensureUser(userID);
    user.warnings += 1;
    const warnings = user.warnings;
    const result = { type, warnings, mutedUntil: 0, kicked: false };

    if (warnings >= cfg.warnLimit) {
      user.mutedUntil = Date.now() + cfg.muteMinutes * 60 * 1000;
      result.mutedUntil = user.mutedUntil;
      user.warnings = 0; // le compteur repart après sanction
    }
    this.db.users.save();
    this.db.bumpStat('warningsIssued');
    return result;
  }

  isMuted(userID, now = Date.now()) {
    const user = this.db.getUser(userID);
    return Boolean(user && user.mutedUntil && user.mutedUntil > now);
  }

  /** Retire le mute d'un membre (admin). */
  unmute(userID) {
    const user = this.db.getUser(userID);
    if (!user) return false;
    user.mutedUntil = 0;
    user.warnings = 0;
    this.db.users.save();
    return true;
  }

  sweep() {
    const now = Date.now();
    for (const [key, ring] of this.tracks) {
      while (ring.length && now - ring[0].ts > 5 * 60 * 1000) ring.shift();
      if (ring.length === 0) this.tracks.delete(key);
    }
    for (const [key, ts] of this.lastPunish) {
      if (now - ts > 10 * 60 * 1000) this.lastPunish.delete(key);
    }
  }
}

module.exports = { AntiSpam };
