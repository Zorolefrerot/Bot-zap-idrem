'use strict';
/*
 * 🧬 MeR~NeL — systems/ucWords.js
 * 🎭 Mots d'Undercover : ~4 200 mots uniques dans 118 catégories.
 * Le mot CIVIL et le mot UNDERCOVER viennent TOUJOURS de la même
 * catégorie (téléphone/ordinateur, pomme/poire…). Règle forte :
 * un même mot civil ne redonne JAMAIS un mot undercover déjà sorti
 * (historique persistant → des milliers de couples distincts).
 */

const WORDS = require('./questions/uc-words.json');
const CATEGORIES = Object.keys(WORDS).filter((c) => Array.isArray(WORDS[c]) && WORDS[c].length >= 2);

/* Tirage d'un couple { civil, under, categorie }.
 * @param {object} pairsStore store persistant { history: { civil: [under…] }, recent: [civil…] }
 * @param {function} rng générateur aléatoire (tests)
 */
function pickPair(pairsStore, rng) {
  const r = rng || Math.random;
  const history = (pairsStore && pairsStore.history) || {};
  const recent = Array.isArray(pairsStore && pairsStore.recent) ? pairsStore.recent : [];

  /* Catégories jouables : au moins 2 mots candidats. */
  const pool = [];
  for (const cat of CATEGORIES) {
    const words = WORDS[cat];
    let free = 0;
    for (const w of words) if (!(history[w] && history[w].length >= words.length - 1)) free++;
    if (free >= 2) pool.push(cat);
  }
  const cat = pool[Math.floor(r() * pool.length)] || CATEGORIES[Math.floor(r() * CATEGORIES.length)];
  const words = WORDS[cat];
  const hasFree = (w) => !(history[w] && history[w].length >= words.length - 1);

  /* Mot civil : hors rotation récente ET avec encore un partenaire libre. */
  const recentSet = new Set(recent.slice(-8).map((w) => w.toLowerCase()));
  let candidates = words.filter((w) => !recentSet.has(w.toLowerCase()) && hasFree(w));
  if (!candidates.length) candidates = words.filter(hasFree);
  if (!candidates.length) candidates = words;
  const civil = candidates[Math.floor(r() * candidates.length)];

  /* Mot undercover : JAMAIS un partenaire déjà sorti avec ce mot civil. */
  const used = new Set((history[civil] || []).map((w) => w.toLowerCase()));
  used.add(civil.toLowerCase());
  let underCandidates = words.filter((w) => !used.has(w.toLowerCase()));
  if (!underCandidates.length) underCandidates = words.filter((w) => w !== civil);
  const under = underCandidates[Math.floor(r() * underCandidates.length)];

  /* Enregistre le couple pour l'anti-répétition. */
  if (pairsStore) {
    if (!pairsStore.history) pairsStore.history = {};
    if (!Array.isArray(pairsStore.history[civil])) pairsStore.history[civil] = [];
    pairsStore.history[civil].push(under);
    if (!Array.isArray(pairsStore.recent)) pairsStore.recent = [];
    pairsStore.recent.push(civil);
    while (pairsStore.recent.length > 60) pairsStore.recent.shift();
    pairsStore.__dirty = true;
  }
  return { civil, under, categorie: cat };
}

module.exports = { pickPair, WORDS, CATEGORIES };
