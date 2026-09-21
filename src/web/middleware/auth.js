import env from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { constantTimeEqual, createSignedToken, verifySignedToken } from '../../utils/crypto.js';

/**
 * Authentification du dashboard.
 * Trois vecteurs acceptés :
 *  1. cookie HTTP-only (cas nominal : frontend servi par le même serveur),
 *  2. en-tête `Authorization: Bearer <token>` (frontend hébergé séparément),
 *  3. en-tête `X-Api-Key` (accès machine-to-machine).
 *
 * Les credentials WhatsApp ne transitent JAMAIS par ces mécanismes.
 */

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: env.security.tokenTtlMs,
  };
}

export function issueToken() {
  return createSignedToken({ sub: 'dashboard', role: 'admin' }, env.security.sessionSecret, env.security.tokenTtlMs);
}

export function readBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

export function isAuthenticated(req) {
  const apiKey = req.headers['x-api-key'];
  if (env.security.apiKey && typeof apiKey === 'string' && constantTimeEqual(apiKey, env.security.apiKey)) {
    req.auth = { sub: 'api-key', role: 'admin' };
    return true;
  }

  const token = req.cookies?.[env.security.cookieName] || readBearerToken(req);
  if (!token) return false;

  const payload = verifySignedToken(token, env.security.sessionSecret);
  if (!payload) return false;

  req.auth = payload;
  return true;
}

export function requireAuth(req, _res, next) {
  if (isAuthenticated(req)) return next();
  return next(ApiError.unauthorized('Authentification requise : connectez-vous au dashboard.'));
}

export function verifyPassword(candidate) {
  return constantTimeEqual(String(candidate ?? ''), env.security.dashboardPassword);
}
