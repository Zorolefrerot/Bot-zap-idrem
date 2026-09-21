/** Erreurs HTTP explicites, converties en réponses JSON propres. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message = 'Requête invalide.', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentification requise.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Action interdite.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Ressource introuvable.') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflit avec l’état actuel du bot.') {
    return new ApiError(409, message);
  }

  static tooMany(message = 'Trop de requêtes, réessayez plus tard.') {
    return new ApiError(429, message);
  }

  static unavailable(message = 'Service temporairement indisponible.') {
    return new ApiError(503, message);
  }

  static internal(message = 'Erreur interne du serveur.') {
    return new ApiError(500, message);
  }
}

/** Erreur fonctionnelle du bot (message affiché à l'utilisateur WhatsApp). */
export class BotError extends Error {
  constructor(message, { silent = false } = {}) {
    super(message);
    this.name = 'BotError';
    this.silent = silent;
  }
}

export function isBoom(error) {
  return Boolean(error && error.isBoom);
}

export function boomStatus(error) {
  return error?.output?.statusCode ?? error?.statusCode ?? null;
}
