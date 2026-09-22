'use strict';
/*
 * 🧬 MeR~NeL — database/database.js
 * Couche d'accès centralisée. Les commandes ne touchent JAMAIS aux JSON
 * directement : tout passe par cette API (écritures atomiques + debounce).
 * La structure est volontairement remplaçable par une vraie BDD
 * (il suffit de réimplémenter cette couche).
 */

const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(file, seed) {
    this.file = file;
    this.seed = seed;
    this.data = this._load();
    this._saveTimer = null;
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (err) {
      // Fichier corrompu : on conserve une copie et on repart du seed,
      // plutôt que de faire planter le bot en boucle.
      try { fs.renameSync(this.file, this.file + '.corrupt-' + Date.now()); } catch (_) { /* */ }
    }
    return JSON.parse(JSON.stringify(this.seed));
  }

  /** Sauvegarde atomique : écriture temporaire puis rename. */
  saveNow() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[database] sauvegarde impossible:', err.message);
    }
  }

  /** Sauvegarde différée (évite des dizaines d'écritures par seconde). */
  save(delay = 400) {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveNow();
    }, delay);
    if (this._saveTimer.unref) this._saveTimer.unref();
  }
}

class Database {
  constructor(dataDir, defaults) {
    this.defaults = defaults;
    fs.mkdirSync(dataDir, { recursive: true });
    this.users = new JsonStore(path.join(dataDir, 'users.json'), {});
    this.groups = new JsonStore(path.join(dataDir, 'groups.json'), {});
    this.stats = new JsonStore(path.join(dataDir, 'stats.json'), {
      messages: 0,
      commands: 0,
      quizzesPlayed: 0,
      duelsPlayed: 0,
      imagesGenerated: 0,
      warningsIssued: 0,
      botStarts: 0,
    });
  }

  /* ── Utilisateurs ── */
  getUser(uid) {
    return this.users.data[String(uid)] || null;
  }

  ensureUser(uid, name = '') {
    const key = String(uid);
    let user = this.users.data[key];
    if (!user) {
      user = {
        uid: key,
        name: name || '',
        nickname: '',
        previousName: '',
        xcoins: this.defaults.economy.startBalance,
        xp: 0,
        level: 1,
        dailyClaim: 0,
        warnings: 0,
        mutedUntil: 0,
        stats: {
          messages: 0,
          commands: 0,
          quizPlayed: 0,
          quizCorrect: 0,
          quizBestScore: 0,
          duelsPlayed: 0,
          duelWins: 0,
          duelLosses: 0,
          duelDraws: 0,
        },
        createdAt: Date.now(),
        lastSeen: 0,
      };
      this.users.data[key] = user;
      this.users.save();
    } else if (name && !user.name) {
      user.name = name;
      this.users.save();
    }
    return user;
  }

  /* ── Groupes ── */
  getGroup(threadID) {
    return this.groups.data[String(threadID)] || null;
  }

  ensureGroup(threadID, name = '') {
    const key = String(threadID);
    let group = this.groups.data[key];
    if (!group) {
      group = {
        threadID: key,
        name: name || '',
        chatMode: false,
        welcome: true,
        settings: {},
        createdAt: Date.now(),
      };
      this.groups.data[key] = group;
      this.groups.save();
    }
    return group;
  }

  /* ── Stats globales ── */
  bumpStat(key, amount = 1) {
    if (!(key in this.stats.data)) this.stats.data[key] = 0;
    this.stats.data[key] += amount;
    this.stats.save();
  }

  saveAll() {
    this.users.saveNow();
    this.groups.saveNow();
    this.stats.saveNow();
  }
}

module.exports = { Database, JsonStore };
