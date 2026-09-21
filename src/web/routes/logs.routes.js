import { Router } from 'express';
import { z } from 'zod';
import { getLogBuffer } from '../../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, validateQuery } from '../middleware/validate.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(60),
});

export function createLogsRouter() {
  const router = Router();

  /**
   * GET /api/logs — derniers événements du bot.
   * Les entrées sont sanitisées à la source : aucun credential, Pair Code
   * brut, Session ID ou mot de passe n'y apparaît.
   */
  router.get(
    '/logs',
    requireAuth,
    validateQuery(querySchema),
    asyncHandler(async (req, res) => {
      res.json({ ok: true, logs: getLogBuffer(req.queryData.limit) });
    }),
  );

  return router;
}

export default createLogsRouter;
