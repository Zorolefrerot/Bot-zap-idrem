import { Router } from 'express';
import { CATEGORIES } from '../../config/defaults.js';
import db from '../../database/index.js';
import { categoryMeta } from '../../bot/loader.js';
import { asyncHandler } from '../middleware/validate.js';

export function createCommandsRouter(manager) {
  const router = Router();

  /**
   * GET /api/commands — catalogue public des commandes (métadonnées uniquement).
   * Utilisé par le dashboard et la page /docs.
   */
  router.get(
    '/commands',
    asyncHandler(async (_req, res) => {
      const commands = manager.listCommands();
      const prefix = db.getSettings().prefix;

      const grouped = CATEGORIES.map((category) => ({
        ...category,
        commands: commands.filter((command) => command.category === category.id),
      })).filter((category) => category.commands.length);

      const others = commands.filter((command) => !CATEGORIES.some((c) => c.id === command.category));
      if (others.length) {
        grouped.push({ ...categoryMeta('other'), commands: others });
      }

      res.json({
        ok: true,
        prefix,
        total: commands.length,
        botName: db.getSettings().botName,
        categories: grouped,
        commands,
      });
    }),
  );

  return router;
}

export default createCommandsRouter;
