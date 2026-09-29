'use strict';
/*
 * 🧬 MeR~NeL — systems/natural.js
 * Compréhension du langage naturel PARTAGÉE (quiz, duels, Jarvis…).
 * Tout est codé ici, à la main — aucune API externe.
 */

const { normalizeAnswer } = require('../utils/formatter');

/* Nombres écrits en français (testés sur un texte SANS espaces squashed
   et sur le texte « doux » qui garde les espaces). */
const NUM_WORDS = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
  sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
  quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60, cent: 100,
};

/* ── Intention d'ARRÊT : « met fin », « arrête le quiz », « annule »… ── */
const CANCEL_EXACT = new Set(['stop', 'cancel', 'fin', 'fini', 'cfini', 'cestfini', 'quit', 'quitte', 'quitter', 'exit', 'arret', 'stoppe']);
const CANCEL_PREFIX = ['metfin', 'metsfin', 'mettrefin', 'arrete', 'annule', 'termine', 'ferme', 'stoppe', 'abandonne', 'coupe'];

function isCancelIntent(raw) {
  let s = normalizeAnswer(raw);
  if (!s) return false;
  /* Invocation en tête : « jarvis mets fin », « mernel arrête le quiz »… */
  s = s.replace(/^(jarvis|mernel|mernel)/, '');
  if (CANCEL_EXACT.has(s)) return true;
  return CANCEL_PREFIX.some((p) => s.startsWith(p));
}

/* Texte normalisé qui GARDE les espaces (pour repérer les mots entiers). */
function soft(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/* Nombres présents dans la phrase (chiffres OU mots français). */
function wordToNumbers(text) {
  const out = [];
  const s = ` ${soft(text)} `;
  for (const [w, n] of Object.entries(NUM_WORDS)) {
    if (new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(s) && !out.includes(n)) out.push(n);
  }
  for (const m of String(text).matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Extrait un NOMBRE d'une phrase naturelle.
 * « cinq » → 5 · « met 10 questions stp » → 10 · « 15 » → 15.
 * @returns {number} 0 si aucun nombre valable dans [min, max].
 */
function parseCount(raw, { min = 1, max = 100 } = {}) {
  for (const m of String(raw).matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (n >= min && n <= max) return n;
  }
  for (const n of wordToNumbers(raw)) {
    if (n >= min && n <= max) return n;
  }
  return 0;
}

module.exports = { isCancelIntent, parseCount, wordToNumbers, NUM_WORDS, soft };
