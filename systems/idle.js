'use strict';
/*
 * 🧬 MeR~NeL — systems/idle.js
 * Mode veille automatique : après IDLE_STANDBY_MINUTES (défaut 30) sans
 * activité dans une conversation, le bot s'endort :
 *   - annonce une seule fois le passage en veille (si STANDBY_ANNOUNCE) ;
 *   - ignore les messages ordinaires (économie d'API et de mémoire) ;
 *   - libère les contextes de chat quand tout le monde dort.
 * Réveil instantané : commande/préfixe, mention du bot, message d'un admin,
 * phrase de réveil (« réveil », « wake up »…), ou arrivée d'un nouveau membre.
 */

class IdleMonitor {
  /**
   * @param {object} config configuration globale (config.idle.*)
   * @param {object} logger logger
   * @param {object} hooks  { onSleepStart(threadID), onAllSleeping() }
   */
  constructor(config, logger, hooks = {}) {
    this.config = config;
    this.logger = logger;
    this.hooks = hooks;
    /** Map<threadID, timestamp> — dernière activité connue par conversation. */
    this.lastActivity = new Map();
    /** Set<threadID> — conversations actuellement endormies. */
    this.sleeping = new Set();
    /** Map<threadID, timestamp> — anti-spam d'annonce de réveil. */
    this.lastWakeAnnounce = new Map();

    this._timer =
      config.idle.sweepMs > 0
        ? setInterval(() => {
            this.sweep().catch(() => {});
          }, config.idle.sweepMs)
        : null;
    if (this._timer && this._timer.unref) this._timer.unref();
  }

  /** Enregistre une activité. Retourne true si le thread VIENT de se réveiller. */
  touch(threadID, ts = Date.now()) {
    const id = String(threadID);
    this.lastActivity.set(id, ts);
    if (this.sleeping.has(id)) {
      this.sleeping.delete(id);
      return true;
    }
    return false;
  }

  /** Réveille explicitement. Retourne true si le thread était endormi. */
  wake(threadID) {
    const id = String(threadID);
    this.lastActivity.set(id, Date.now());
    const was = this.sleeping.has(id);
    this.sleeping.delete(id);
    return was;
  }

  /**
   * Le thread est-il endormi ? (évaluation paresseuse : même si le sweep
   * n'a pas encore tourné, le seuil dépassé compte comme endormi).
   * Un thread jamais actif est considéré éveillé.
   */
  isSleeping(threadID, now = Date.now()) {
    const id = String(threadID);
    if (this.sleeping.has(id)) return true;
    const last = this.lastActivity.get(id);
    if (last == null) return false;
    return now - last > this.config.idle.standbyMs;
  }

  /** Anti-spam : au plus une annonce de réveil par fenêtre de cooldown. */
  canAnnounceWake(threadID, now = Date.now()) {
    const id = String(threadID);
    const last = this.lastWakeAnnounce.get(id) || 0;
    if (now - last < this.config.idle.wakeAnnounceCooldownMs) return false;
    this.lastWakeAnnounce.set(id, now);
    return true;
  }

  /** Parcourt les conversations et endort celles au-delà du seuil. */
  async sweep() {
    const now = Date.now();
    let newly = 0;
    for (const [id, last] of [...this.lastActivity]) {
      if (!this.sleeping.has(id) && now - last > this.config.idle.standbyMs) {
        this.sleeping.add(id);
        newly++;
        if (this.hooks.onSleepStart) {
          try {
            await this.hooks.onSleepStart(id);
          } catch (err) {
            this.logger.warn('[idle] annonce de veille impossible:', err.message);
          }
        }
      }
    }
    // Hygiène globale : plus personne d'éveillé → on libère les contextes.
    if (newly > 0 && this.lastActivity.size > 0 && this.sleeping.size >= this.lastActivity.size) {
      if (this.hooks.onAllSleeping) {
        try {
          this.hooks.onAllSleeping();
        } catch (_) { /* jamais bloquer le sweep */ }
      }
    }
  }

  knownThreads() {
    return [...this.lastActivity.keys()];
  }

  destroy() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}

module.exports = { IdleMonitor };
