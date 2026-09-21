import env from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('http');

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route inconnue : ${req.method} ${req.originalUrl}`));
}

/** Convertit toute erreur en réponse JSON homogène, sans fuite technique. */
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = 'Erreur interne du serveur.';
  let details;

  if (err instanceof ApiError) {
    status = err.status;
    message = err.message;
    details = err.details;
  } else if (err?.name === 'ValidationError') {
    status = 400;
    message = err.message;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Corps JSON invalide.';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'Charge utile trop volumineuse.';
  } else if (err?.code === 'EBADCSRFTOKEN') {
    status = 403;
    message = 'Jeton invalide.';
  } else if (err?.message) {
    message = env.isProduction ? message : err.message;
  }

  if (status >= 500) {
    logger.error('erreur serveur', { path: req.originalUrl, reason: err?.message, stack: env.isProduction ? undefined : err?.stack });
  } else {
    logger.debug('erreur client', { path: req.originalUrl, status, reason: err?.message });
  }

  res.status(status).json({ ok: false, error: { status, message, details } });
}
