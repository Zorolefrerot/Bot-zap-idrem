import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';
import { hasStoredCredentials } from '../../auth/sessionStore.js';
import { requireAuth } from '../middleware/auth.js';
import { actionLimiter } from '../middleware/rateLimit.js';
import { asyncHandler, validateBody } from '../middleware/validate.js';

const logger = createLogger('api:connection');

const disconnectSchema = z.object({
  logout: z.boolean().optional().default(true),
});

export function createConnectionRouter(manager) {
  const router = Router();

  /** POST /api/reconnect — reconnexion avec la session stockée (sans Pair Code). */
  router.post(
    '/reconnect',
    requireAuth,
    actionLimiter,
    asyncHandler(async (_req, res) => {
      if (!(await hasStoredCredentials())) {
        throw ApiError.conflict('Aucune session stockée : générez d’abord un Pair Code.');
      }

      const result = await manager.reconnect();
      logger.info('reconnexion demandée depuis le dashboard');
      res.json({ ok: true, status: manager.status, ...result });
    }),
  );

  /**
   * POST /api/disconnect
   * `logout: true`  -> retire le device de WhatsApp (Pair Code requis ensuite).
   * `logout: false` -> ferme la connexion en conservant la session stockée.
   */
  router.post(
    '/disconnect',
    requireAuth,
    actionLimiter,
    validateBody(disconnectSchema),
    asyncHandler(async (req, res) => {
      const result = await manager.disconnect({ logout: req.data.logout });
      logger.info('déconnexion demandée', { logout: req.data.logout });
      res.json({ ok: true, status: manager.status, ...result });
    }),
  );

  /** GET /api/qr — QR code de secours (data URL), si WhatsApp en fournit un. */
  router.get(
    '/qr',
    requireAuth,
    asyncHandler(async (_req, res) => {
      if (!manager.qr?.dataUrl) {
        throw ApiError.notFound('Aucun QR code disponible (utilisez le Pair Code).');
      }
      res.json({ ok: true, qr: manager.qr.dataUrl, generatedAt: manager.qr.generatedAt });
    }),
  );

  return router;
}

export default createConnectionRouter;
