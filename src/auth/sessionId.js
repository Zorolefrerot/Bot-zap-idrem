import db from '../database/index.js';
import { generateSessionId, splitSessionId } from '../utils/crypto.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('session-id');

/**
 * Cycle de vie des Session ID (`IDREM-TERESHKOVA-…`).
 *
 * Une Session ID est une RÉFÉRENCE opaque vers le dossier de credentials
 * WhatsApp côté serveur : elle ne contient aucune clé, aucun identifiant
 * WhatsApp. La régénération fait tourner la référence sans toucher aux
 * credentials (pas de ré-appairage).
 */

/** Crée une nouvelle session, l'enregistre en base et l'active. */
export function createSession({ phone = null, jid = null, authDir }) {
  const id = generateSessionId();
  const session = db.registerSession({ id, phone, jid, authDir });
  db.setActiveSession(id);
  logger.info('session créée', { session: sessionFingerprint(id) });
  return session;
}

/** Marque la session comme connectée (horodatage + identité vérifiée). */
export function markConnected(id, { phone = null, jid = null } = {}) {
  const now = new Date().toISOString();
  const patch = { connectedAt: now, lastSeenAt: now };
  if (phone) patch.phone = phone;
  if (jid) patch.jid = jid;
  return db.updateSession(id, patch);
}

/** Révoque une session (nouveau pairing, logout, rotation). */
export function revokeSession(idOrSession, reason = 'revoked') {
  const id = typeof idOrSession === 'string' ? idOrSession : idOrSession?.id;
  if (!id) return null;

  const updated = db.revokeSession(id, reason);
  if (updated) logger.info('session révoquée', { session: sessionFingerprint(id), reason });
  return updated;
}

/**
 * Rotation de la Session ID : mêmes credentials WhatsApp, nouvelle référence.
 * L'ancienne session est révoquée, la nouvelle devient active.
 */
export function regenerateSession(activeId) {
  const current = db.getSession(activeId);
  if (!current) return null;

  const next = createSession({ phone: current.phone, jid: current.jid, authDir: current.authDir });
  revokeSession(current.id, 'rotated');
  // revokeSession a pu désactiver l'ancienne ; la nouvelle reste active.
  db.setActiveSession(next.id);
  logger.info('session id régénérée', { session: sessionFingerprint(next.id) });
  return next;
}

/**
 * Vue PUBLIQUE d'une session (API / dashboard) : jamais d'`authDir`,
 * jamais de donnée WhatsApp brute — uniquement la référence et les horodatages.
 */
export function toPublicSession(session) {
  if (!session) return null;
  const { prefix, body } = splitSessionId(session.id);
  return {
    sessionId: session.id,
    prefix,
    body,
    createdAt: session.createdAt || null,
    connectedAt: session.connectedAt || null,
    lastSeenAt: session.lastSeenAt || null,
    revoked: Boolean(session.revoked),
    revokeReason: session.revokeReason || null,
  };
}

/** Empreinte courte et non sensible d'une Session ID, pour les logs. */
export function sessionFingerprint(id) {
  const { prefix, body } = splitSessionId(id || '');
  if (!body || body.length < 12) return `${prefix}…`;
  return `${prefix}${body.slice(0, 4)}…${body.slice(-4)}`;
}

export default {
  createSession,
  markConnected,
  revokeSession,
  regenerateSession,
  toPublicSession,
  sessionFingerprint,
};
