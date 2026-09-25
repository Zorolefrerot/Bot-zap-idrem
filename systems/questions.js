'use strict';
/*
 * 🧬 MeR~NeL — systems/questions.js
 * Banques de questions à RÉPONSE LIBRE pour Xquiz (v4 — moteur Xid) :
 * {q, a, alts?} — le joueur tape la réponse, tolérance orthographique.
 *
 * Xduel garde ses banques QCM historiques (duel-*.json) via loadDuelBank.
 */

const fs = require('fs');
const path = require('path');

const BANKS_DIR = path.join(__dirname, 'questions');

/* ── Catégories Xquiz (réponse libre) ── */
const CATEGORIES = {
  id: {
    label: '🪪 𝗜𝗗 — Indices de personnages',
    short: 'ID',
    aliases: ['id', 'identification', 'perso', 'personnage'],
    file: 'id.json',
    style: 'indice',
  },
  multivers: {
    label: '🌌 𝗠𝗨𝗟𝗧𝗜𝗩𝗘𝗥𝗦 — Anime & mangas',
    short: 'MULTIVERS',
    aliases: ['multivers', 'anime', 'manga', 'mu', 'mv'],
    file: 'multivers.json',
    style: 'indice',
  },
  cg: {
    label: '🧠 𝗖𝗚 — Culture générale',
    short: 'CG',
    aliases: ['cg', 'culture', 'culturegenerale', 'cultregenerale'],
    file: 'cg.json',
    style: 'indice',
  },
  capitale: {
    label: '🌍 𝗖𝗔𝗣𝗜𝗧𝗔𝗟𝗘 — Pays → Capitale',
    short: 'CAPITALE',
    aliases: ['capitale', 'capitales', 'pays'],
    file: 'capitale.json',
    style: 'capitale',
  },
  drapeau: {
    label: '🚩 𝗗𝗥𝗔𝗣𝗘𝗔𝗨 — Trouve le pays',
    short: 'DRAPEAU',
    aliases: ['drapeau', 'drapeaux', 'flag', 'flags'],
    file: 'drapeau.json',
    style: 'drapeau',
  },
};

/* ── Catégories Xduel (QCM historiques) ── */
const DUEL_CATEGORIES = {
  cg: { short: 'CG', aliases: ['cg', 'culture'], file: 'duel-cg.json' },
  multivers: { short: 'MULTIVERS', aliases: ['multivers', 'anime', 'mu', 'mv'], file: 'duel-multivers.json' },
  id: { short: 'ID', aliases: ['id', 'identification', 'photo'], file: 'duel-id.json' },
};

const cache = new Map();

/* Charge une banque à réponse libre : {q, a, alts?}. */
function loadBank(categoryKey) {
  const cat = CATEGORIES[categoryKey];
  if (!cat) return [];
  if (cache.has(`quiz:${categoryKey}`)) return cache.get(`quiz:${categoryKey}`);
  let bank = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(BANKS_DIR, cat.file), 'utf8'));
    bank = (Array.isArray(raw) ? raw : [])
      .filter((q) => q && q.a && q.q)
      .map((q) => ({
        q: String(q.q),
        a: String(q.a),
        alts: Array.isArray(q.alts) ? q.alts.map(String) : [],
      }));
  } catch (_) {
    bank = []; // banque absente/corrompue → catégorie indisponible, bot stable
  }
  cache.set(`quiz:${categoryKey}`, bank);
  return bank;
}

/* Charge une banque QCM (Xduel) : {q, options?, answer, image?, hint?}. */
function loadDuelBank(categoryKey) {
  const cat = DUEL_CATEGORIES[categoryKey];
  if (!cat) return [];
  if (cache.has(`duel:${categoryKey}`)) return cache.get(`duel:${categoryKey}`);
  let bank = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(BANKS_DIR, cat.file), 'utf8'));
    bank = (Array.isArray(raw) ? raw : [])
      .filter((q) => q && q.answer)
      .map((q) => ({
        q: q.q || null,
        options: Array.isArray(q.options) ? q.options.slice(0, 6) : null,
        answer: String(q.answer),
        image: q.image || null,
        hint: q.hint || null,
        type: q.options ? 'mcq' : 'id',
      }));
  } catch (_) {
    bank = [];
  }
  cache.set(`duel:${categoryKey}`, bank);
  return bank;
}

/* Résout la catégorie tapée par un joueur (Xquiz). */
function resolveCategory(raw) {
  const norm = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (cat.aliases.includes(norm)) return key;
  }
  return null;
}

/* Résout la catégorie tapée par un joueur (Xduel, QCM). */
function resolveDuelCategory(raw) {
  const norm = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  for (const [key, cat] of Object.entries(DUEL_CATEGORIES)) {
    if (cat.aliases.includes(norm)) return key;
  }
  return null;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = {
  CATEGORIES,
  DUEL_CATEGORIES,
  loadBank,
  loadDuelBank,
  resolveCategory,
  resolveDuelCategory,
  shuffle,
};
