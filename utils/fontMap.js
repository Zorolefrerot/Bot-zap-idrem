'use strict';
/*
 * 🧬 MeR~NeL — utils/fontMap.js
 * Transformations Unicode de texte pour Xpolice — 20 polices, zéro dépendance.
 * Les lettres sans équivalent Unicode (trous des blocs script/fraktur/double)
 * retombent sur la lettre d'origine.
 */

const A = 'A'.charCodeAt(0);
const a = 'a'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);

/* Construit une map char→char sur un bloc continu (fromCodePoint : astral ✓). */
function block(baseUpper, baseLower, baseDigit) {
  const m = {};
  for (let i = 0; i < 26; i++) {
    if (baseUpper) m[String.fromCharCode(A + i)] = String.fromCodePoint(baseUpper + i);
    if (baseLower) m[String.fromCharCode(a + i)] = String.fromCodePoint(baseLower + i);
  }
  if (baseDigit != null) {
    for (let i = 0; i < 10; i++) m[String.fromCharCode(ZERO + i)] = String.fromCodePoint(baseDigit + i);
  }
  return m;
}

/* Petites capitales (aucun bloc continu en Unicode → map manuelle). */
const SMALL_CAPS_MAP = {};
const SMALL_CAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ';
for (let i = 0; i < 26; i++) SMALL_CAPS_MAP[String.fromCharCode(A + i)] = SMALL_CAPS[i];
for (let i = 0; i < 26; i++) SMALL_CAPS_MAP[String.fromCharCode(a + i)] = SMALL_CAPS[i];

/* Texte renversé (upside-down). */
const FLIP = {};
{
  const lo = 'abcdefghijklmnopqrstuvwxyz?.',
    up = 'ɐqɔpǝɟƃɥıɾʞlɯuodbɹsʇnʌʍxʎz¿˙';
  for (let i = 0; i < lo.length; i++) FLIP[lo[i]] = up[i];
  for (let i = 0; i < 26; i++) FLIP[String.fromCharCode(A + i)] = up[i].toUpperCase();
}

const CIRCLED = block(0x24b6, 0x24d0, 0x2460); // Ⓐ ⓐ ①
const SQUARED = block(0x1f130, 0x1f130, null); // 🄰
const SQUARED_NEG = block(0x1f170, 0x1f170, null); // 🅰
const PAREN = block(0x1f110, 0x249c, null); // 🄐 ⒜
const BLACK_CIRCLED = block(0x1f150, 0x1f150, null); // 🅐🅑🅒

const STYLES = [
  ['gras', '𝗚𝗿𝗮𝘀', block(0x1d400, 0x1d41a, 0x1d7ce)],
  ['italique', '𝘐𝘵𝘢𝘭𝘪𝘲𝘶𝘦', block(0x1d434, 0x1d44e, null)],
  ['italique-gras', '𝘽𝙤𝙡𝙙 𝙄𝙩𝙖𝙡𝙞𝙘', block(0x1d468, 0x1d482, null)],
  ['script', '𝓢𝓬𝓻𝓲𝓹𝓽', { ...block(0x1d49c, 0x1d4b6, null), B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' }],
  ['script-gras', '𝓑𝓸𝓵𝓭 𝓢𝓬𝓻𝓲𝓹𝓽', block(0x1d4d0, 0x1d4ea, null)],
  ['gothique', '𝔉𝔯𝔞𝔨𝔱𝔲𝔯', { ...block(0x1d504, 0x1d51e, null), C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' }],
  ['gothique-gras', '𝕲𝖔𝖙𝖍𝖎𝖈', block(0x1d56c, 0x1d586, null)],
  ['double', '𝔻𝕠𝕦𝕓𝕝𝕖', { ...block(0x1d538, 0x1d552, 0x1d7d8), C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }],
  ['sans', '𝖲𝖺𝗇𝗌', block(0x1d5a0, 0x1d5ba, 0x1d7e2)],
  ['sans-gras', '𝗦𝗮𝗻𝘀 𝗕𝗼𝗹𝗱', block(0x1d5d4, 0x1d5ee, 0x1d7ec)],
  ['sans-italique', '𝘚𝘢𝘯𝘴 𝘐𝘵𝘢𝘭𝘪𝘲𝘶𝘦', block(0x1d608, 0x1d622, null)],
  ['sans-italique-gras', '𝙎𝙖𝙣𝙨 𝘽𝙤𝙡𝙙 𝙄𝙩𝙖𝙡𝙞𝙦𝙪𝙚', block(0x1d63c, 0x1d656, null)],
  ['monospace', '𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎', block(0x1d670, 0x1d68a, 0x1d7f6)],
  ['cerclé', 'Ⓒⓔⓡⓒⓛé', CIRCLED],
  ['cerclé-noir', '🅒🅔🅡🅒🅛🅔🅓', BLACK_CIRCLED],
  ['carré', '🅂🅀🅄🄰🅁🄴', SQUARED],
  ['carré-noir', '🅂🅀🅄🄰🅁🄴', SQUARED_NEG],
  ['parenthese', '⒫⒜Ⓡ⒠⒩', PAREN],
  ['petites-caps', 'Sᴍᴀʟʟ Cᴀᴘs', SMALL_CAPS_MAP],
  ['renversé', 'dǝsdı', FLIP],
];

/* Souligné / barré : caractères combinants ajoutés. */
function combining(text, mark) {
  return String(text)
    .split('')
    .map((c) => (c === ' ' ? c : c + mark))
    .join('');
}

const EXTRA = {
  souligné: (t) => combining(t, '\u0332'),
  barré: (t) => combining(t, '\u0338'),
};

/* Liste publique : { id, aperçu } ×20 */
function listStyles() {
  return STYLES.map(([id, preview]) => ({ id, preview }));
}

function hasStyle(id) {
  const k = String(id || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return STYLES.some(([sid]) => sid.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === k) || !!EXTRA[k];
}

function transform(text, styleId) {
  const k = String(styleId || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const style = STYLES.find(([sid]) => sid.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === k);
  if (style) {
    const map = style[2];
    return String(text)
      .split('')
      .map((c) => map[c] || c)
      .join('');
  }
  if (EXTRA[k]) return EXTRA[k](text);
  return null;
}

module.exports = { listStyles, hasStyle, transform };
