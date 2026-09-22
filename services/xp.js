"use strict";

/**
 * services/xp.js
 * ---------------------------------------------------------------------------
 * Système d'expérience et de niveaux.
 *
 * Courbe : XP total requis pour atteindre le niveau L
 *          base × (factor^(L-1) − 1) / (factor − 1)
 *
 * Les gains sont plafonnés par `maxLevel` et l'XP par message est limitée par
 * `messageIntervalMs` (anti-farm : on ne gagne pas d'XP en spammant).
 * ---------------------------------------------------------------------------
 */

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @param {object} deps
 * @param {object} deps.users   services/users.js
 * @param {object} deps.config
 * @param {object} [deps.logger]
 */
function createXp(deps = {}) {
  const { users, config } = deps;
  const logger = deps.logger || noopLogger;

  const base = () => Number(config.xp.base) || 100;
  const factor = () => Number(config.xp.factor) || 1.5;
  const maxLevel = () => Number(config.xp.maxLevel) || 200;

  /** XP total nécessaire pour ATTEINDRE `level`. */
  function xpForLevel(level) {
    const lvl = Math.max(1, Math.min(maxLevel(), Number(level) || 1));
    const f = factor();
    if (lvl <= 1) return 0;
    return Math.floor((base() * (Math.pow(f, lvl - 1) - 1)) / (f - 1));
  }

  /** Niveau correspondant à un total d'XP. */
  function levelFromXp(xp) {
    const total = Math.max(0, Number(xp) || 0);
    let level = 1;
    while (level < maxLevel() && total >= xpForLevel(level + 1)) level += 1;
    return level;
  }

  /** Progression lisible dans le niveau courant. */
  function progress(xp) {
    const total = Math.max(0, Number(xp) || 0);
    const level = levelFromXp(total);
    const floor = xpForLevel(level);
    const isMax = level >= maxLevel();
    const ceiling = isMax ? floor + 1 : xpForLevel(level + 1);
    const current = isMax ? 0 : total - floor;
    const needed = isMax ? 0 : Math.max(1, ceiling - floor);
    return {
      level,
      total,
      current,
      needed,
      nextLevel: isMax ? null : level + 1,
      percent: isMax ? 100 : Math.min(100, Math.round((current / needed) * 100)),
      maxed: isMax
    };
  }

  /** Profil XP d'un utilisateur. */
  function getProfile(userID) {
    const record = users.get(userID);
    if (!record) return null;
    const p = progress(record.xp);
    return { ...record, ...p };
  }

  /**
   * Ajoute de l'XP.
   *
   * @param {string} userID
   * @param {number} amount
   * @param {{ reason?: string, throttled?: boolean }} [options]
   *   throttled=true → applique le délai anti-farm (messages ordinaires).
   * @returns {{ ok: boolean, gained: number, level: number, leveledUp: boolean, from?: number, profile?: object }}
   */
  function addXp(userID, amount, options = {}) {
    const record = users.get(userID);
    if (!record) return { ok: false, gained: 0, level: 1, leveledUp: false };

    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    if (gain <= 0) {
      return { ok: false, gained: 0, level: record.level, leveledUp: false, profile: progress(record.xp) };
    }

    // Anti-farm pour les messages ordinaires.
    if (options.throttled) {
      const interval = Number(config.xp.messageIntervalMs) || 60000;
      const last = Number(record.lastXpAt) || 0;
      if (Date.now() - last < interval) {
        return { ok: false, gained: 0, level: record.level, leveledUp: false, profile: progress(record.xp) };
      }
    }

    const before = progress(record.xp);
    if (before.maxed) {
      return { ok: false, gained: 0, level: before.level, leveledUp: false, profile: before, maxed: true };
    }

    const fromLevel = before.level;
    record.xp = Math.max(0, record.xp + gain);
    record.lastXpAt = Date.now();
    const after = progress(record.xp);
    record.level = after.level;
    users.update(userID, { xp: record.xp, level: after.level, lastXpAt: record.lastXpAt });

    const leveledUp = after.level > fromLevel;
    if (leveledUp) logger.debug(`XP : ${userID} atteint le niveau ${after.level}.`, "xp");

    return { ok: true, gained: gain, level: after.level, from: fromLevel, leveledUp, profile: after };
  }

  /** XP gagné pour un message ordinaire. */
  function onMessage(userID) {
    return addXp(userID, Number(config.xp.perMessage) || 0, { throttled: true, reason: "message" });
  }

  /** XP gagné pour une commande. */
  function onCommand(userID) {
    return addXp(userID, Number(config.xp.perCommand) || 0, { reason: "command" });
  }

  /** Récompenses de jeu selon le résultat. */
  function gameReward(result) {
    const key = ["win", "lose", "draw"].includes(result) ? result : "draw";
    return {
      xp: Number(config.games.xpReward[key]) || 0,
      coins: Number(config.games.coinReward[key]) || 0
    };
  }

  /** Applique une récompense de jeu (XP + pièce via economy). */
  function applyGameReward(userID, result, economy) {
    const reward = gameReward(result);
    const xpResult = addXp(userID, reward.xp, { reason: `game:${result}` });
    let coins = 0;
    if (reward.coins > 0 && economy) {
      const credited = economy.add(userID, reward.coins, `jeu (${result})`);
      coins = credited ? reward.coins : 0;
    }
    users.addGame(userID, result === "win");
    return { ...reward, coinsGiven: coins, leveledUp: xpResult.leveledUp, level: xpResult.level };
  }

  return {
    xpForLevel,
    levelFromXp,
    progress,
    getProfile,
    addXp,
    onMessage,
    onCommand,
    gameReward,
    applyGameReward
  };
}

module.exports = { createXp };
