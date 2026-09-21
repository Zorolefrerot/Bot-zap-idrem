import { Router } from 'express';
import { ApiError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { actionLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/validate.js';

const logger = createLogger('api:session');

export function createSessionRouter(manager) {
  const router = Router();

  /**
   * GET /api/session
   * Retourne la Session ID courante (référence opaque, jamais les credentials).
   */
  router.get(
    '/session',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const session = manager.getPublicSession();

      if (!session?.sessionId) {
        return res.json({
          ok: true,
          generated: false,
          session: null,
          status: manager.status,
          hint: 'Générez un Pair Code puis connectez WhatsApp : la Session ID est créée automatiquement.',
        });
      }

      res.json({
        ok: true,
        generated: true,
        session,
        connected: manager.isConnected(),
        status: manager.status,
      });
    }),
  );

  /** POST /api/session/regenerate — rotation de la Session ID (mêmes credentials). */
  router.post(
    '/session/regenerate',
    requireAuth,
    actionLimiter,
    asyncHandler(async (_req, res) => {
      if (!manager.isConnected()) {
        throw ApiError.conflict('WhatsApp doit être connecté pour régénérer une Session ID.');
      }

      const session = manager.regenerateSession();
      logger.info('session id régénérée via API');
      res.json({ ok: true, session, connected: true });
    }),
  );

  return router;
}

export default createSessionRouter;
