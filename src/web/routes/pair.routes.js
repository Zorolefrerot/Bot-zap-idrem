import { Router } from 'express';
import db from '../../database/index.js';
import { WA_STATUS } from '../../config/defaults.js';
import { ApiError } from '../../utils/errors.js';
import { formatPhone } from '../../utils/format.js';
import { pairSchema } from '../../utils/validate.js';
import { createLogger } from '../../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { pairLimiter } from '../middleware/rateLimit.js';
import { asyncHandler, validateBody } from '../middleware/validate.js';

const logger = createLogger('api:pair');

export function createPairRouter(manager) {
  const router = Router();

  /**
   * POST /api/pair
   * Démarre un appairage et renvoie le Pair Code (format XXXX-XXXX).
   * Les credentials WhatsApp ne quittent jamais le serveur.
   */
  router.post(
    '/pair',
    requireAuth,
    pairLimiter,
    validateBody(pairSchema),
    asyncHandler(async (req, res) => {
      const payload = req.data;

      if (manager.isConnected()) {
        throw ApiError.conflict(
          'WhatsApp est déjà connecté. Utilisez « Déconnecter » avant de générer un nouveau Pair Code.',
        );
      }

      const result = await manager.pair(payload);
      logger.info('pair code délivré', { phone: formatPhone(result.phone) });

      res.json({
        ok: true,
        pairCode: result.pairCode,
        phone: formatPhone(result.phone),
        phoneDigits: result.phone,
        expiresAt: result.expiresAt,
        instructions: [
          'Ouvrez WhatsApp sur le téléphone à connecter',
          'Menu ⋮ (ou Réglages) → Appareils connectés',
          'Connecter un appareil → « Connecter avec un numéro de téléphone »',
          'Saisissez le Pair Code affiché ci-dessus',
        ],
        status: manager.status,
      });
    }),
  );

  /** GET /api/pair — dernier code généré (sans donnée sensible). */
  router.get(
    '/pair',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const pair = manager.pairCode;
      const expired = pair ? Date.now() > new Date(pair.expiresAt).getTime() : true;
      res.json({
        ok: true,
        pairCode: pair && !expired ? pair.display : null,
        expiresAt: pair?.expiresAt || null,
        expired,
        status: manager.status,
        waitingForCode: manager.status === WA_STATUS.PAIRING,
        settings: db.getSettings(),
      });
    }),
  );

  return router;
}

export default createPairRouter;
