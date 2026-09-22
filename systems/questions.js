'use strict';
/*
 * 🧬 MeR~NeL — systems/questions.js
 * Chargement des banques de questions (éditables en JSON).
 */

const fs = require('fs');
const path = require('path');

const BANKS_DIR = path.join(__dirname, 'questions');
const ID_IMAGES_DIR = path.join(__dirname, '..', 'assets', 'quiz', 'id');

const CATEGORIES = {
  cg: {
    label: '🧠 𝗖𝗚 — Culture générale',
    short: 'CG',
    aliases: ['cg', 'culture', 'cultregenerale', 'culturegenerale'],
    file: 'cg.json',
    type: 'mcq',
  },
  multivers: {
    label: '🌌 𝗠𝗨𝗟𝗧𝗜𝗩𝗘𝗥𝗦 — Anime',
    short: 'MULTIVERS',
    aliases: ['multivers', 'anime', 'mu', 'mv'],
    file: 'multivers.json',
    type: 'mcq',
  },
  id: {
    label: '🪪 𝗜𝗗 — Identification',
    short: 'ID',
    aliases: ['id', 'identification', 'photo'],
    file: 'id.json',
    type: 'id',
  },
};

const cache = new Map();

function loadBank(categoryKey) {
  const cat = CATEGORIES[categoryKey];
  if (!cat) return [];
  if (cache.has(categoryKey)) return cache.get(categoryKey);
  let bank = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(BANKS_DIR, cat.file), 'utf8'));
    bank = raw
      .filter((q) => q && q.answer)
      .map((q) => ({
        q: q.q || null,
        options: Array.isArray(q.options) ? q.options.slice(0, 6) : null,
        answer: String(q.answer),
        image: q.image || null,
        hint: q.hint || null,
        type: q.options ? 'mcq' : cat.type,
      }));
  } catch (err) {
    // Banque absente/corrompue → catégorie indisponible mais bot stable.
    bank = [];
  }
  cache.set(categoryKey, bank);
  return bank;
}

/** Résout un texte utilisateur vers une catégorie ('cg' | 'multivers' | 'id' | null). */
function resolveCategory(text) {
  const norm = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
  for (const [key, cat] of Object.entries(CATEGORIES)) {
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

function idImagePath(fileName) {
  if (!fileName) return null;
  const full = path.join(ID_IMAGES_DIR, fileName);
  try {
    return fs.existsSync(full) ? full : null;
  } catch (_) {
    return null;
  }
}

module.exports = { CATEGORIES, loadBank, resolveCategory, shuffle, idImagePath };
