import { ApiError } from '../../utils/errors.js';
import { formatZodError } from '../../utils/validate.js';

/** Valide le corps de la requête et expose le résultat dans `req.data`. */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(ApiError.badRequest('Données invalides.', formatZodError(result.error)));
    }
    req.data = result.data;
    return next();
  };
}

/** Valide les paramètres de requête (`?key=value`). */
export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      return next(ApiError.badRequest('Paramètres invalides.', formatZodError(result.error)));
    }
    req.queryData = result.data;
    return next();
  };
}

/** Enveloppe un gestionnaire asynchrone pour propager les erreurs. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
