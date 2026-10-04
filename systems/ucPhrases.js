'use strict';
/*
 * 🧬 MeR~NeL — systems/ucPhrases.js
 * 💀 Phrases d'accroche DRÔLES d'élimination Undercover (210 !) :
 * 70 civil 🥲 · 70 undercover 🕵️ · 70 Mr. White ⚪ — avec les noms
 * des joueurs insérés ({name} victime, {voter} 1er votant, {word} mot UC).
 */

const DATA = require('./questions/uc-phrases.json');

/**
 * Choisit une phrase de mort aléatoire et y insère les noms.
 * @returns {string[]} 2 à 4 lignes prêtes à afficher
 */
function pickDeathPhrase(role, vars = {}) {
  const arr = DATA[role] || DATA.civil;
  const tpl = arr[Math.floor(Math.random() * arr.length)];
  return tpl.map((line) =>
    String(line)
      .split('{name}')
      .join(vars.name || 'Un joueur')
      .split('{voter}')
      .join(vars.voter || 'le village')
      .split('{word}')
      .join(vars.word || '???')
      .split('{civ}')
      .join(vars.civ || '???')
  );
}

module.exports = { pickDeathPhrase, PHRASES: DATA };
