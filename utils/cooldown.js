'use strict';
/*
 * 🧬 MeR~NeL — utils/cooldown.js
 * Limitation de requêtes / anti-spam de commandes, calculée côté serveur.
 */

class Cooldowns {
  constructor() {
    this.map = new Map(); // key → expiry timestamp
    // Nettoyage périodique pour éviter toute fuite mémoire.
    this._timer = setInterval(() => this.sweep(), 5 * 60 * 1000);
    if (this._timer.unref) this._timer.unref();
  }

  /**
   * Vérifie ET pose le cooldown si disponible.
   * @returns {{ ok: boolean, remainingMs: number }}
   */
  check(key, ms) {
    const now = Date.now();
    const expiry = this.map.get(key) || 0;
    if (expiry > now) {
      return { ok: false, remainingMs: expiry - now };
    }
    this.map.set(key, now + ms);
    return { ok: true, remainingMs: 0 };
  }

  /* Vérifie sans poser le cooldown. */
  peek(key) {
    const now = Date.now();
    const expiry = this.map.get(key) || 0;
    return { ok: expiry <= now, remainingMs: Math.max(0, expiry - now) };
  }

  hit(key, ms) {
    this.map.set(key, Date.now() + ms);
  }

  reset(key) {
    this.map.delete(key);
  }

  sweep() {
    const now = Date.now();
    for (const [k, expiry] of this.map) {
      if (expiry <= now) this.map.delete(k);
    }
  }
}

/* Formatage humain d'un délai restant */
function humanDelay(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
  const d = Math.floor(h / 24);
  return `${d} j ${h % 24 ? `${h % 24} h` : ''}`.trim();
}

module.exports = { Cooldowns, humanDelay };
