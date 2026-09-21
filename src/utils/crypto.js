import crypto from 'node:crypto';
import { SESSION_ID_ENTROPY_BYTES, SESSION_ID_PREFIX } from '../config/defaults.js';

/** Buffer -> base64url sans padding. */
export function toBase64Url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Session ID : préfixe imposé `IDREM-TERESHKOVA-` + 32 octets aléatoires
 * cryptographiquement sûrs (base64url => 43 caractères).
 * La Session ID est une RÉFÉRENCE vers les credentials conservés côté
 * serveur : elle ne contient jamais de donnée WhatsApp.
 */
export function generateSessionId() {
  return SESSION_ID_PREFIX + crypto.randomBytes(SESSION_ID_ENTROPY_BYTES).toString('base64url');
}

export function isValidSessionIdFormat(value) {
  if (typeof value !== 'string' || !value.startsWith(SESSION_ID_PREFIX)) return false;
  const body = value.slice(SESSION_ID_PREFIX.length);
  return /^[A-Za-z0-9_-]{20,128}$/.test(body);
}

/** Formate une Session ID pour l'affichage (préfixe mis en évidence). */
export function splitSessionId(value) {
  const str = String(value || '');
  return { prefix: SESSION_ID_PREFIX, body: str.slice(SESSION_ID_PREFIX.length), full: str };
}

export function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) {
    // On compare quand même pour éviter le timing attack sur la longueur.
    crypto.timingSafeEqual(bufA, crypto.createHash('sha256').update(bufA).digest().subarray(0, bufA.length) || bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

/** Signature HMAC-SHA256 (base64url) — utilisée pour les tokens du dashboard. */
export function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Crée un token compact et vérifiable : `payload.signature`. */
export function createSignedToken(data, secret, ttlMs) {
  const payload = { ...data, iat: Date.now(), exp: Date.now() + ttlMs };
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function verifySignedToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const idx = token.lastIndexOf('.');
  const body = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  const expected = sign(body, secret);
  if (!constantTimeEqual(signature, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}
