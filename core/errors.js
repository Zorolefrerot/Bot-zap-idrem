"use strict";

/**
 * core/errors.js
 * ---------------------------------------------------------------------------
 * Gestion centralisée des erreurs.
 *
 * Trois niveaux :
 *   1. UserError      → message destiné à l'utilisateur (validation, solde
 *                       insuffisant…). Affiché tel quel, jamais journalisé
 *                       comme une erreur technique.
 *   2. Erreur de commande → journalisée (message nettoyé de toute donnée
 *                       sensible), comptabilisée, et l'utilisateur reçoit un
 *                       message simple. Le bot CONTINUE de tourner.
 *   3. Erreur globale (uncaughtException / unhandledRejection) → journalisée ;
 *                       le bot ne s'arrête que si les erreurs s'accumulent
 *                       (Render le relance alors proprement).
 *
 * Aucune trace de cookie, token ou session Facebook ne sort : tout passe par
 * sanitize() (utils/logger.js).
 * ---------------------------------------------------------------------------
 */

const { sanitize, formatError } = require("../utils/logger");
const i18n = require("../utils/i18n");

/** Erreur dont le message est destiné à être affiché à l'utilisateur. */
class UserError extends Error {
  /**
   * @param {string} message texte lisible pour l'utilisateur
   * @param {{ title?: string, hint?: string, code?: string }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = "UserError";
    this.userFacing = true;
    this.title = options.title || "";
    this.hint = options.hint || "";
    this.code = options.code || "";
  }
}

/** Erreur « service non configuré » : message propre, aucun stack affiché. */
class NotConfiguredError extends UserError {
  constructor(service, hint = "") {
    super(`${service} : service non configuré sur ce déploiement.`, { title: "Service indisponible", hint });
    this.name = "NotConfiguredError";
    this.kind = "not-configured";
  }
}

/**
 * Fabrique le gestionnaire d'erreurs du bot.
 *
 * @param {object} deps
 * @param {object} deps.logger
 * @param {object} [deps.stats]
 * @param {object} [deps.logs]
 * @param {object} [deps.text]
 * @param {(payload: string|object, threadID: string) => Promise<void>} [deps.send]
 * @param {() => Promise<void>} [deps.onFatal]
 */
function createErrorHandler(deps = {}) {
  const logger = deps.logger || console;
  const stats = deps.stats || null;
  const logs = deps.logs || null;
  const text = deps.text || null;
  const send = typeof deps.send === "function" ? deps.send : null;
  const onFatal = typeof deps.onFatal === "function" ? deps.onFatal : null;

  let fatalCount = 0;
  let fatalWindowStart = Date.now();
  const FATAL_WINDOW_MS = 60000;
  const FATAL_THRESHOLD = 5;

  /**
   * Message utilisateur à partir d'une erreur.
   * Les erreurs « utilisateur » (UserError) sont déjà rédigées par la commande ;
   * les erreurs techniques donnent le message générique, traduit si besoin.
   */
  function userMessage(err, language) {
    if (err instanceof UserError || (err && err.userFacing)) {
      const title = err.title ? `${err.title}\n` : "";
      const hint = err.hint ? `\n💡 ${err.hint}` : "";
      return `${title}${err.message}${hint}`;
    }
    return i18n.say("error", language);
  }

  /** L'erreur est-elle destinée à l'utilisateur (donc non technique) ? */
  function isUserFacing(err) {
    return Boolean(err && (err instanceof UserError || err.userFacing));
  }

  /**
   * Traite une erreur de commande : log + stats + réponse utilisateur.
   *
   * @param {unknown} err
   * @param {{ command?: object, ctx?: object, scope?: string, silent?: boolean, language?: string }} [context]
   * @returns {Promise<boolean>} true si un message a pu être envoyé
   */
  async function handle(err, context = {}) {
    const command = context.command || null;
    const ctx = context.ctx || null;
    const scope = context.scope || (command ? `command:${command.name}` : "bot");
    const technical = err instanceof Error ? formatError(err) : String(err);

    if (isUserFacing(err)) {
      // Erreur attendue (validation, refus…) : trace légère, pas d'alarme.
      logger.debug(`${scope} → ${sanitize(err.message)}`, "errors");
    } else {
      logger.error(`${scope} → ${technical}`, "errors");
      if (stats && typeof stats.recordError === "function") {
        stats.recordError({ command: command ? command.name : "", scope, message: sanitize(String((err && err.message) || err)).slice(0, 300) });
      }
      if (logs && typeof logs.error === "function") {
        logs.error(scope, sanitize(String((err && err.message) || err)).slice(0, 300), {
          command: command ? command.name : undefined,
          threadID: ctx && ctx.threadID ? String(ctx.threadID) : undefined,
          userID: ctx && ctx.senderID ? String(ctx.senderID) : undefined
        });
      }
    }

    if (context.silent || !ctx || !ctx.threadID) return false;

    const language = i18n.resolveLanguage(context.language || (ctx && ctx.settings && ctx.settings.language));
    const message = userMessage(err, language);
    try {
      if (send) {
        await send(message, String(ctx.threadID));
        return true;
      }
      if (typeof ctx.replyAsync === "function") {
        await ctx.replyAsync(message);
        return true;
      }
    } catch (sendErr) {
      logger.warn(`Impossible d'envoyer le message d'erreur : ${sanitize(String(sendErr.message))}`, "errors");
    }
    return false;
  }

  /** Enveloppe une fonction pour qu'elle ne lève jamais d'exception non gérée. */
  function wrap(fn, context = {}) {
    return async function wrapped(...args) {
      try {
        return await fn(...args);
      } catch (err) {
        await handle(err, context);
        return undefined;
      }
    };
  }

  /**
   * Installe les gestionnaires globaux.
   * Le bot NE MEURT PAS sur une erreur isolée ; il s'arrête proprement si les
   * erreurs fatales s'accumulent (Redémarrage Render propre plutôt qu'un état
   * corrompu qui tourne en boucle).
   */
  function installGlobalHandlers(options = {}) {
    const exitOnFatal = options.exitOnFatal !== false;

    function noteFatal(kind, err) {
      const now = Date.now();
      if (now - fatalWindowStart > FATAL_WINDOW_MS) {
        fatalWindowStart = now;
        fatalCount = 0;
      }
      fatalCount += 1;

      const technical = err instanceof Error ? formatError(err) : sanitize(String(err));
      logger.error(`${kind} (${fatalCount}/${FATAL_THRESHOLD} sur 60 s) → ${technical}`, "fatal");
      if (stats && typeof stats.recordError === "function") {
        stats.recordError({ command: "", scope: kind, message: sanitize(String((err && err.message) || err)).slice(0, 300) });
      }
      if (logs && typeof logs.error === "function") logs.error(kind, sanitize(String((err && err.message) || err)).slice(0, 300));

      if (exitOnFatal && fatalCount >= FATAL_THRESHOLD) {
        logger.error("Trop d'erreurs fatales rapprochées : arrêt propre pour redémarrage.", "fatal");
        Promise.resolve(onFatal ? onFatal() : undefined)
          .catch(() => undefined)
          .finally(() => {
            setTimeout(() => process.exit(1), 300).unref?.();
          });
      }
    }

    process.on("unhandledRejection", (reason) => {
      noteFatal("unhandledRejection", reason instanceof Error ? reason : new Error(String(reason)));
    });

    process.on("uncaughtException", (err) => {
      noteFatal("uncaughtException", err);
    });

    return {
      fatalCount: () => fatalCount,
      reset: () => {
        fatalCount = 0;
        fatalWindowStart = Date.now();
      }
    };
  }

  return {
    UserError,
    NotConfiguredError,
    userMessage,
    isUserFacing,
    handle,
    wrap,
    installGlobalHandlers,
    fatal: () => fatalCount
  };
}

module.exports = { createErrorHandler, UserError, NotConfiguredError };
