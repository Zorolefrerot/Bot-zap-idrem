'use strict';
/*
 * 🧬 MeR~NeL — systems/economy.js
 * XCoins : soldes, daily (cooldown serveur 24 h), classement.
 * Toutes les écritures passent par la couche database.
 */

class Economy {
  constructor(db, config, logger) {
    this.db = db;
    this.config = config;
    this.logger = logger;
  }

  ensureUser(uid, name) {
    return this.db.ensureUser(uid, name);
  }

  getBalance(uid) {
    const user = this.db.getUser(uid);
    return user ? user.xcoins : 0;
  }

  /** Ajoute (ou retire si négatif) des XCoins. Retourne le nouveau solde. */
  addCoins(uid, amount) {
    const user = this.db.ensureUser(uid);
    const amt = Math.round(Number(amount) || 0);
    user.xcoins = Math.max(0, user.xcoins + amt);
    this.db.users.save();
    return user.xcoins;
  }

  /** Débit sécurisé : refuse si solde insuffisant. */
  spend(uid, amount) {
    const user = this.db.ensureUser(uid);
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0 || user.xcoins < amt) {
      return { ok: false, balance: user.xcoins };
    }
    user.xcoins -= amt;
    this.db.users.save();
    return { ok: true, balance: user.xcoins };
  }

  /**
   * Daily — cooldown strictement calculé côté serveur.
   * @returns {{ ok: boolean, reward?: number, nextInMs?: number, balance?: number }}
   */
  claimDaily(uid) {
    const user = this.db.ensureUser(uid);
    const now = Date.now();
    const elapsed = now - (user.dailyClaim || 0);
    if (user.dailyClaim && elapsed < this.config.economy.dailyCooldownMs) {
      return { ok: false, nextInMs: this.config.economy.dailyCooldownMs - elapsed };
    }
    user.dailyClaim = now;
    user.xcoins += this.config.economy.dailyReward;
    this.db.users.save();
    this.db.bumpStat('dailiesClaimed');
    return { ok: true, reward: this.config.economy.dailyReward, balance: user.xcoins };
  }

  /** Classement par XCoins (descendant). */
  leaderboard(limit = 10) {
    const all = Object.values(this.db.users.data);
    all.sort((a, b) => b.xcoins - a.xcoins);
    return all.slice(0, limit);
  }

  /** Position 1-based du membre dans le classement XCoins. */
  positionOf(uid) {
    const user = this.db.getUser(uid);
    if (!user) return null;
    const all = Object.values(this.db.users.data);
    all.sort((a, b) => b.xcoins - a.xcoins);
    const idx = all.findIndex((u) => String(u.uid) === String(uid));
    return idx >= 0 ? idx + 1 : null;
  }

  totalMembers() {
    return Object.keys(this.db.users.data).length;
  }
}

module.exports = { Economy };
