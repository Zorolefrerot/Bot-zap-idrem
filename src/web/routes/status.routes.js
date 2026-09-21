import { Router } from 'express';
import db from '../../database/index.js';
import env from '../../config/env.js';
import { capabilities } from '../../utils/system.js';
import { hasFfmpeg } from '../../utils/ffmpeg.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validate.js';

export function createStatusRouter(manager) {
  const router = Router();

  /** GET /api/health — sonde publique (aucune donnée sensible). */
  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      project: env.projectName,
      uptimeMs: Date.now() - manager.bootedAt,
      whatsappConnected: manager.isConnected(),
      time: new Date().toISOString(),
    });
  });

  /** GET /api/status — état complet pour le dashboard (authentifié). */
  router.get(
    '/status',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const status = manager.getStatus();
      const caps = await capabilities();

      res.json({
        ok: true,
        ...status,
        settings: db.getSettings(),
        capabilities: caps,
        ffmpeg: await hasFfmpeg(),
      });
    }),
  );

  return router;
}

export default createStatusRouter;
