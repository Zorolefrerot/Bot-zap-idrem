import rateLimit from 'express-rate-limit';
import env from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';

const { rateLimit: limits } = env.security;

function limiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (req, res, next) => next(ApiError.tooMany(message)),
  });
}

export const apiLimiter = limiter({
  windowMs: limits.windowMs,
  max: limits.max,
  message: 'Trop de requêtes API. Réessayez dans quelques minutes.',
});

export const pairLimiter = limiter({
  windowMs: limits.windowMs,
  max: limits.pairMax,
  message: 'Trop de Pair Codes générés. Attendez avant de réessayer.',
});

export const loginLimiter = limiter({
  windowMs: limits.windowMs,
  max: limits.loginMax,
  message: 'Trop de tentatives de connexion. Attendez avant de réessayer.',
});

export const actionLimiter = limiter({
  windowMs: 60_000,
  max: 20,
  message: 'Trop d’actions consécutives, patientez quelques secondes.',
});
