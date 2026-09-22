'use strict';
/*
 * 🧬 MeR~NeL — utils/sanitize.js
 * Validation des entrées : aucune valeur utilisateur n'est utilisée brute.
 */

const fmt = require('./formatter');

/** Texte général sûr (longueur bornée, zéro caractère de contrôle). */
function sanitizeText(text, maxLen = 1500) {
  return fmt.clean(text, maxLen);
}

/** Requête destinée à une URL/API externe — strict. */
function sanitizeQuery(text, maxLen = 200) {
  const q = fmt.clean(text, maxLen);
  if (!q) return null;
  // Rejette tout ce qui ressemble à une injection d'URL/contrôle.
  if (/[\u0000-\u001f\u007f]/.test(q)) return null;
  return q;
}

/** Entier sûr (mises, nombres de questions, quantités d'images…). */
function safeInt(value, { min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = parseInt(String(value == null ? '' : value).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/** UID Facebook plausible : chiffres uniquement. */
function safeUid(value) {
  const s = String(value == null ? '' : value).trim();
  if (!/^\d{5,20}$/.test(s)) return null;
  return s;
}

module.exports = { sanitizeText, sanitizeQuery, safeInt, safeUid };
