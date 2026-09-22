"use strict";

/**
 * utils/random.js
 * ---------------------------------------------------------------------------
 * Tirages aléatoires + valeurs DÉTERMINISTES indexées sur une clé et le jour.
 *
 * Le déterminisme est indispensable pour les commandes de type /rate,
 * /gayrate, /ship ou /character : un même utilisateur doit obtenir le même
 * résultat dans la journée, sinon le bot se contredit et les utilisateurs
 * relancent en boucle.
 * ---------------------------------------------------------------------------
 */

/** Entier aléatoire dans [min, max] inclus. */
function randInt(min, max) {
  const lo = Math.ceil(Number(min) || 0);
  const hi = Math.floor(Number(max) || 0);
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Élément aléatoire d'un tableau. */
function pick(list) {
  const arr = Array.isArray(list) ? list.filter((v) => v !== undefined && v !== null) : [];
  if (!arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** N éléments distincts d'un tableau. */
function sample(list, count) {
  const arr = Array.isArray(list) ? [...list] : [];
  const n = Math.min(Math.max(0, Number(count) || 0), arr.length);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0]);
  }
  return out;
}

/** Mélange Fisher-Yates (ne modifie pas le tableau d'origine). */
function shuffle(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Tirage booléen : chance(0.45) → true 45 % du temps. */
function chance(probability) {
  return Math.random() < Math.min(1, Math.max(0, Number(probability) || 0));
}

/** Tirage pondéré : weighted([{ v: "a", w: 3 }, { v: "b", w: 1 }]). */
function weighted(entries) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && Number(e.w) > 0) : [];
  if (!list.length) return undefined;
  const total = list.reduce((sum, e) => sum + Number(e.w), 0);
  let roll = Math.random() * total;
  for (const entry of list) {
    roll -= Number(entry.w);
    if (roll <= 0) return entry.v !== undefined ? entry.v : entry;
  }
  const last = list[list.length - 1];
  return last.v !== undefined ? last.v : last;
}

/** Hash FNV-1a 32 bits d'une chaîne. */
function hash(text) {
  const str = String(text ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function seeded(seed) {
  let a = hash(seed) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clé du jour (YYYY-MM-DD) en heure locale. */
function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Valeur déterministe stable pour la journée.
 *
 * @param {string} key       ex. `${userID}:rate`
 * @param {number} min
 * @param {number} max
 * @param {string} [salt]    ex. dayKey() pour une remise à zéro quotidienne
 */
function dailyValue(key, min = 0, max = 100, salt = dayKey()) {
  const rnd = seeded(`${key}|${salt}`);
  const lo = Math.ceil(Number(min) || 0);
  const hi = Math.floor(Number(max) || 0);
  if (hi <= lo) return lo;
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

/** Choix déterministe stable pour la journée dans une liste. */
function dailyPick(key, list, salt = dayKey()) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return undefined;
  return arr[dailyValue(key, 0, arr.length - 1, salt)];
}

/** Identifiant court (sessions de jeu, rappels…). */
function shortId(length = 6) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < Math.max(1, length); i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Pourcentage présenté avec son qualificatif (barème partagé par les jeux sociaux). */
function verdict(percent) {
  const p = Number(percent) || 0;
  if (p >= 95) return { label: "Destin absolu", icon: "💞", comment: "C'est écrit dans les étoiles." };
  if (p >= 85) return { label: "Excellente entente", icon: "🔥", comment: "Belle compatibilité !" };
  if (p >= 70) return { label: "Très bon départ", icon: "✨", comment: "Ça mérite d'être creusé." };
  if (p >= 55) return { label: "Potentiel réel", icon: "🙂", comment: "Il manque juste une étincelle." };
  if (p >= 40) return { label: "Neutre", icon: "😐", comment: "Ni feu, ni glace." };
  if (p >= 25) return { label: "Compliqué", icon: "🌧️", comment: "Va falloir négocier." };
  if (p >= 10) return { label: "Peu probable", icon: "🧊", comment: "Le courant ne passe pas." };
  return { label: "Incompatible", icon: "💀", comment: "Fuyez, ou riez-en." };
}

module.exports = {
  randInt,
  pick,
  sample,
  shuffle,
  chance,
  weighted,
  hash,
  seeded,
  dayKey,
  dailyValue,
  dailyPick,
  shortId,
  verdict
};
