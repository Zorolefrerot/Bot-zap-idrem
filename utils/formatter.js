'use strict';
/*
 * 🧬 MeR~NeL — utils/formatter.js
 * Identité visuelle : gras Unicode, cadres futuristes, séparateurs, variantes.
 */

/* ── Gras Unicode (Mathematical Alphanumeric) ── */
const B_LOWER = 0x1d5ee; // 𝗮
const B_UPPER = 0x1d5d4; // 𝗔
const B_DIGIT = 0x1d7ec; // 𝟬

function bold(text) {
  const s = String(text == null ? '' : text);
  let out = '';
  for (const ch of s.normalize('NFD')) {
    const code = ch.codePointAt(0);
    if (code >= 0x61 && code <= 0x7a) out += String.fromCodePoint(B_LOWER + (code - 0x61));
    else if (code >= 0x41 && code <= 0x5a) out += String.fromCodePoint(B_UPPER + (code - 0x41));
    else if (code >= 0x30 && code <= 0x39) out += String.fromCodePoint(B_DIGIT + (code - 0x30));
    else out += ch;
  }
  return out.normalize('NFC');
}

/* Nombre formaté "15 400" en gras Unicode. */
function boldNum(n) {
  const grouped = String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  return bold(grouped);
}

function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ── Cadres ── */
const FRAME_STYLES = [
  { top: '╭━━〔 {title} 〕━━╮', bottom: '╰━━〔 🧬 𝗠𝗲𝗥~𝗡𝗘𝗟 〕━━╯' },
  { top: '╭━━━〔 {title} 〕━━━╮', bottom: '╰━━━〔 🧬 𝗠𝗲𝗥~𝗡𝗘𝗟 〕━━━╯' },
  { top: '┏━━〔 {title} 〕━━┓', bottom: '┗━━〔 🧬 𝗠𝗲𝗥~𝗡𝗘𝗟 〕━━┛' },
];

const SEPARATORS = ['━━━━━━━━━━━━━━', '▬▬▬▬▬▬▬▬▬▬▬▬', '──────────────'];

const TAGS = ['⚡', '🧬', '🛰️', '🌌'];

/**
 * Construit un cadre MeR~NeL.
 * @param {string} title  titre (sera mis en gras automatiquement)
 * @param {string|string[]} lines contenu
 * @param {object} [opts] { footer: string|null, style: number }
 */
function frame(title, lines, opts = {}) {
  const style = opts.style != null ? FRAME_STYLES[opts.style % FRAME_STYLES.length] : pick(FRAME_STYLES);
  const tag = opts.tag === null ? '' : ` ${opts.tag || pick(TAGS)}`;
  const body = Array.isArray(lines) ? lines.join('\n') : String(lines == null ? '' : lines);
  const footer = opts.footer === null ? '' : (opts.footer != null ? opts.footer : style.bottom);
  const parts = [style.top.replace('{title}', `${bold(title)}${tag}`), body.trim()];
  if (footer) parts.push(footer);
  return parts.filter(Boolean).join('\n');
}

function separator() {
  return pick(SEPARATORS);
}

/* Barre de progression futuriste */
function progressBar(current, max, length = 10) {
  const c = Math.max(0, Math.min(Number(current) || 0, Number(max) || 1));
  const m = Math.max(1, Number(max) || 1);
  const filled = Math.round((c / m) * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

/* Nettoyage de base d'un texte entrant */
function clean(text, maxLen = 1500) {
  return String(text == null ? '' : text)
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, maxLen);
}

function truncate(text, maxLen = 300) {
  const s = String(text == null ? '' : text);
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}

/* Normalisation pour comparaison de réponses (quiz/duel) */
function normalizeAnswer(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/* Distance de Levenshtein compacte (tolérance fautes de frappe) */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

/* Réponse quiz correcte ? (exact normalisé, ou tolérance de 1 pour les mots longs) */
function answerMatches(given, expected) {
  const g = normalizeAnswer(given);
  const e = normalizeAnswer(expected);
  if (!g || !e) return false;
  if (g === e) return true;
  if (e.length >= 6 && Math.abs(g.length - e.length) <= 2) return levenshtein(g, e) <= 1;
  return false;
}

module.exports = {
  bold,
  boldNum,
  pick,
  frame,
  separator,
  progressBar,
  clean,
  truncate,
  normalizeAnswer,
  answerMatches,
  levenshtein,
};
