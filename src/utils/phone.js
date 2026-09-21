/**
 * Normalisation des numéros de téléphone WhatsApp.
 * Aucun code pays n'est deviné : un numéro doit être saisi au format
 * international (sans le "+"), ex. 243970000000.
 */

export function digitsOnly(value) {
  return String(value ?? '').replace(/[^\d]/g, '');
}

/**
 * Retourne le numéro au format international (chiffres uniquement) ou null.
 * Accepte "+243 970 000 000", "00243970000000", "243970000000".
 */
export function normalizePhone(value) {
  let raw = String(value ?? '').trim();
  if (!raw) return null;

  raw = raw.replace(/[\s().-]/g, '');
  if (raw.startsWith('00')) raw = raw.slice(2);
  if (raw.startsWith('+')) raw = raw.slice(1);

  const digits = digitsOnly(raw);
  if (!/^\d{7,15}$/.test(digits)) return null;
  if (digits.startsWith('0')) return null; // format national : code pays manquant
  return digits;
}

export function isValidPhone(value) {
  return normalizePhone(value) !== null;
}

export function phoneToJid(phone) {
  const normalized = normalizePhone(phone);
  return normalized ? `${normalized}@s.whatsapp.net` : null;
}

export function jidToPhone(jid) {
  if (typeof jid !== 'string') return '';
  return jid.split('@')[0].split(':')[0];
}

/** Compare deux numéros en ignorant la mise en forme. */
export function isSamePhone(a, b) {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return Boolean(na && nb && na === nb);
}

/** Compare deux JID en ignorant le device (`:12`) et la casse. */
export function isSameJid(a, b) {
  if (!a || !b) return false;
  const norm = (j) => String(j).toLowerCase().replace(/:\d+/, '');
  return norm(a) === norm(b);
}

export function isGroupJid(jid) {
  return String(jid || '').endsWith('@g.us');
}
