'use strict';
/*
 * 🧬 MeR~NeL — systems/xp.js
 * Expérience & niveaux — entièrement piloté par cette configuration.
 * Pour modifier la courbe : ajuster XP_LEVELS (ou laisser la formule
 * prendre le relais au-delà du tableau).
 */

const XP_LEVELS = [
  0, // niveau 1
  100, // niveau 2
  250, // niveau 3
  500, // niveau 4
  800,
  1200,
  1700,
  2300,
  3000,
  3800,
  4700,
  5700,
  6800,
  8000,
  9300,
  10700,
  12200,
  13800,
  15500,
  17300,
];

/* Au-delà du tableau : seuil(n) = seuil(n-1) + 1000 + 50*(n-1) */
function thresholdForLevel(level) {
  const l = Math.max(1, Math.floor(level));
  if (l <= XP_LEVELS.length) return XP_LEVELS[l - 1];
  let t = XP_LEVELS[XP_LEVELS.length - 1];
  for (let i = XP_LEVELS.length + 1; i <= l; i++) t += 1000 + 50 * (i - 1);
  return t;
}

function levelFromXp(xp) {
  let level = 1;
  while (thresholdForLevel(level + 1) <= xp) level++;
  return level;
}

class XpSystem {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }

  /**
   * Ajoute de l'XP et gère la montée de niveau.
   * @returns {{ xp, level, leveledUp, previousLevel, nextThreshold }}
   */
  addXp(uid, amount) {
    const user = this.db.ensureUser(uid);
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    const previousLevel = user.level;
    user.xp += amt;
    const newLevel = levelFromXp(user.xp);
    user.level = newLevel;
    this.db.users.save();
    return {
      xp: user.xp,
      level: newLevel,
      previousLevel,
      leveledUp: newLevel > previousLevel,
      nextThreshold: thresholdForLevel(newLevel + 1),
    };
  }

  info(uid) {
    const user = this.db.ensureUser(uid);
    const level = levelFromXp(user.xp);
    const current = thresholdForLevel(level);
    const next = thresholdForLevel(level + 1);
    return {
      xp: user.xp,
      level,
      currentThreshold: current,
      nextThreshold: next,
      intoLevel: user.xp - current,
      needed: next - current,
      progress: Math.min(1, (user.xp - current) / Math.max(1, next - current)),
    };
  }
}

module.exports = { XpSystem, XP_LEVELS, thresholdForLevel, levelFromXp };
