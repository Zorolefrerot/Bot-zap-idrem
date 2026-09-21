import { Router } from 'express';
import env from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { loginSchema } from '../../utils/validate.js';
import { createLogger } from '../../utils/logger.js';
import { cookieOptions, isAuthenticated, issueToken, verifyPassword } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { asyncHandler, validateBody } from '../middleware/validate.js';

const logger = createLogger('api:auth');

export function createAuthRouter() {
  const router = Router();

  /** Connexion au dashboard : mot de passe -> cookie HTTP-only + token Bearer. */
  router.post(
    '/auth/login',
    loginLimiter,
    validateBody(loginSchema),
    asyncHandler(async (req, res) => {
      if (!verifyPassword(req.data.password)) {
        logger.warn('tentative de connexion refusée', { ip: req.ip });
        throw ApiError.unauthorized('Mot de passe incorrect.');
      }

      const token = issueToken();
      res.cookie(env.security.cookieName, token, cookieOptions());
      logger.info('connexion dashboard réussie');

      res.json({
        ok: true,
        token,
        expiresIn: env.security.tokenTtlMs,
        passwordGenerated: env.security.dashboardPasswordGenerated,
      });
    }),
  );

  router.post(
    '/auth/logout',
    asyncHandler(async (req, res) => {
      res.clearCookie(env.security.cookieName, cookieOptions());
      res.json({ ok: true });
    }),
  );

  router.get('/auth/me', (req, res) => {
    res.json({ ok: true, authenticated: isAuthenticated(req), role: req.auth?.role || null });
  });

  return router;
}

export default createAuthRouter;
