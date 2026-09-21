import { Router } from 'express';
import { createAuthRouter } from './auth.routes.js';
import { createCommandsRouter } from './commands.routes.js';
import { createConfigRouter } from './config.routes.js';
import { createConnectionRouter } from './connection.routes.js';
import { createLogsRouter } from './logs.routes.js';
import { createPairRouter } from './pair.routes.js';
import { createSessionRouter } from './session.routes.js';
import { createStatusRouter } from './status.routes.js';

/** Assemble toutes les routes de l'API REST sous `/api`. */
export function createApiRouter(manager) {
  const router = Router();

  // Publics
  router.use(createStatusRouter(manager)); // GET /health, GET /status (protégé)
  router.use(createCommandsRouter(manager)); // GET /commands
  router.use(createAuthRouter()); // POST /auth/login, /auth/logout, GET /auth/me

  // Protégés (requireAuth)
  router.use(createPairRouter(manager)); // POST/GET /pair
  router.use(createSessionRouter(manager)); // GET /session, POST /session/regenerate
  router.use(createConnectionRouter(manager)); // POST /reconnect, /disconnect, GET /qr
  router.use(createConfigRouter()); // GET/POST /config
  router.use(createLogsRouter()); // GET /logs

  return router;
}

export default createApiRouter;
