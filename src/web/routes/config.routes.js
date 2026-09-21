import { Router } from 'express';
import db from '../../database/index.js';
import env from '../../config/env.js';
import { settingsSchema } from '../../utils/validate.js';
import { createLogger } from '../../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { actionLimiter } from '../middleware/rateLimit.js';
import { asyncHandler, validateBody } from '../middleware/validate.js';

const logger = createLogger('api:config');

export function createConfigRouter() {
  const router = Router();

  /** GET /api/config — configuration courante du bot. */
  router.get(
    '/config',
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json({
        ok: true,
        settings: db.getSettings(),
        defaults: env.botDefaults,
        project: env.projectName,
      });
    }),
  );

  /**
   * POST /api/config — mise à jour depuis le dashboard.
   * Toutes les valeurs sont validées avant persistance.
   */
  router.post(
    '/config',
    requireAuth,
    actionLimiter,
    validateBody(settingsSchema),
    asyncHandler(async (req, res) => {
      const settings = db.updateSettings(req.data);
      await db.flush();
      logger.info('configuration mise à jour depuis le dashboard', { fields: Object.keys(req.data) });
      res.json({ ok: true, settings });
    }),
  );

  return router;
}

export default createConfigRouter;
