"use strict";

/**
 * core/lifecycle.js
 * ---------------------------------------------------------------------------
 * Cycle de vie : connexion Facebook, écoute, reconnexion maîtrisée, serveur de
 * statut, sauvegarde distante, arrêt propre.
 *
 * Règles :
 *   • AUCUN cookie / token / contenu de account.txt n'est journalisé.
 *   • Pas de boucle de reconnexion infinie : tentatives bornées avec délai
 *     croissant, puis arrêt net (Render relance le service).
 *   • Un échec de connexion produit un diagnostic ACTIONNABLE (fichier absent,
 *     cookies expirés, checkpoint Facebook…).
 * ---------------------------------------------------------------------------
 */

const fca = require("@dongdev/fca-unofficial");
const { loadAccount, AccountError } = require("../utils/account");
const { startHealthServer } = require("../utils/health-server");
const { sanitize, formatError } = require("../utils/logger");
const { sleep } = require("../utils/helpers");

/** Options réellement reconnues par `setOptions` dans la librairie. */
const FCA_OPTION_KEYS = [
  "online",
  "selfListen",
  "listenEvents",
  "updatePresence",
  "forceLogin",
  "autoMarkRead",
  "listenTyping",
  "autoReconnect",
  "emitReady",
  "selfListenEvent"
];

/** Construit les options FCA sans clé inconnue (évite les avertissements). */
function buildFcaOptions(config) {
  const options = {};
  for (const key of FCA_OPTION_KEYS) {
    const value = config.connection[key];
    if (typeof value === "boolean") options[key] = value;
  }
  if (typeof config.connection.userAgent === "string" && config.connection.userAgent) {
    options.userAgent = config.connection.userAgent;
  }
  if (typeof config.connection.proxy === "string" && config.connection.proxy) {
    options.proxy = config.connection.proxy;
  }
  return options;
}

/** Traduit une erreur de connexion en diagnostic lisible. */
function diagnose(err) {
  if (err instanceof AccountError) return { title: "Compte Facebook", detail: err.message, action: err.code || "ACCOUNT_ERROR" };
  const message = sanitize(String((err && err.message) || err || ""));

  if (/checkpoint/i.test(message)) {
    return {
      title: "Checkpoint Facebook",
      detail: "Facebook demande une vérification du compte (checkpoint).",
      action: "Ouvre le compte dans un navigateur, valide la vérification, puis remplace account.txt par de nouveaux cookies."
    };
  }
  if (/login\s*(blocked|approval)|approval/i.test(message)) {
    return {
      title: "Connexion bloquée",
      detail: "Facebook refuse cette session.",
      action: "Génère de nouveaux cookies après une connexion manuelle réussie."
    };
  }
  if (/invalid|expired|not logged in|c_user|xs/i.test(message)) {
    return {
      title: "Cookies invalides ou expirés",
      detail: "La session fournie n'est plus acceptée.",
      action: "Remplace account.txt (ou FB_APPSTATE) par un appState frais."
    };
  }
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|getaddrinfo|network/i.test(message)) {
    return {
      title: "Réseau injoignable",
      detail: "Impossible de joindre les serveurs Facebook.",
      action: "Vérifie la sortie réseau de l'hébergement (proxy, pare-feu, DNS)."
    };
  }
  if (/account.*(inactive|disabled|locked)/i.test(message)) {
    return { title: "Compte inactif", detail: "Le compte lié à cette session est désactivé.", action: "Utilise un autre compte." };
  }
  return { title: "Échec de connexion", detail: message.slice(0, 240), action: "Vérifie account.txt et les journaux ci-dessus." };
}

/**
 * Démarre le bot : connexion, écoute, services périodiques.
 *
 * @param {object} app résultat de createBotApp()
 * @returns {Promise<{ ok: boolean, error?: object, botUserID?: string }>}
 */
async function start(app) {
  const { config, logger, services, dispatcher, permissions, store, registry } = app;

  // 1. Données distantes éventuelles AVANT de démarrer les minuteurs.
  if (store.remoteEnabled()) {
    const restored = await store.restoreRemote();
    if (restored.restored && restored.restored.length) {
      logger.info(`Collections restaurées : ${restored.restored.join(", ")}.`, "storage");
    }
    store.startSnapshotLoop();
  } else {
    logger.warn(
      "Aucun stockage distant configuré : les données vivent dans " +
        `${config._meta.dataDir}. Sur Render, ce disque est ÉPHÉMÈRE — monte un disque et définis DATA_DIR, ` +
        "ou renseigne REMOTE_STORE_URL pour conserver les données entre deux déploiements.",
      "storage"
    );
  }

  services.stats.onBoot();

  // 2. Serveur de statut (Render attend un port HTTP).
  try {
    const health = await startHealthServer({
      config,
      logger,
      getStatus: () => ({
        state: app.runtime.status === "online" ? "ok" : app.runtime.status,
        ...app.status()
      })
    });
    app.setHealth({ stop: async () => (health && typeof health.close === "function" ? health.close() : undefined), port: health && health.port });
    if (health && health.port) logger.success(`Serveur de statut actif sur le port ${health.port} (/health).`, "http");
  } catch (err) {
    logger.warn(`Serveur de statut non démarré : ${err.message}`, "http");
  }

  // 3. Rappels programmés.
  services.scheduler.start();
  const pending = services.scheduler.count();
  if (pending) logger.info(`${pending} rappel(s) en attente.`, "scheduler");

  // 4. Connexion Facebook.
  let account;
  try {
    account = loadAccount({ env: process.env, rootDir: config._meta.rootDir, logger });
  } catch (err) {
    const diag = diagnose(err);
    app.setStatus("error");
    logger.error(`${diag.title} : ${diag.detail}`, "account");
    logger.error(`Action requise : ${diag.action}`, "account");
    await notifyOwner(app, `⛔ ${diag.title}\n\n${diag.detail}\n\n🛠️ ${diag.action}`);
    return { ok: false, error: { ...diag, technical: sanitize(err.message) } };
  }

  logger.info(`Compte chargé (${account.source}, stratégie ${account.strategy}).`, "account");

  const fcaOptions = buildFcaOptions(config);
  const maxAttempts = Math.max(1, Math.min(10, Number(config.connection.loginRetries) || 3));
  const baseDelay = Math.max(2000, Number(config.connection.loginRetryDelayMs) || 10000);

  let bot = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      logger.info(`Connexion à Facebook (tentative ${attempt}/${maxAttempts})…`, "fca");
      bot = await fca.createMessengerBot(account.credentials, {
        autoListen: false,
        enableComposer: true,
        commandPrefix: config.prefix,
        stopOnSignals: false, // les signaux sont gérés ici (sauvegarde des données d'abord)
        maxEventListeners: 64,
        ...fcaOptions
      });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const diag = diagnose(err);
      logger.error(`Tentative ${attempt} échouée — ${diag.title} : ${diag.detail}`, "fca");

      // Inutile d'insister sur un compte invalide ou un checkpoint.
      const fatalCodes = ["ACCOUNT_NOT_FOUND", "ACCOUNT_EMPTY", "ACCOUNT_INVALID_COOKIE", "ACCOUNT_FILE_NOT_FOUND", "ACCOUNT_READ_ERROR"];
      const isFatal = fatalCodes.includes(err && err.code) || /checkpoint|inactive|disabled/i.test(diag.title);
      if (isFatal || attempt === maxAttempts) break;

      const delay = baseDelay * attempt;
      logger.warn(`Nouvelle tentative dans ${Math.round(delay / 1000)} s…`, "fca");
      await sleep(delay);
    }
  }

  if (!bot) {
    const diag = diagnose(lastError || new Error("connexion impossible"));
    app.setStatus("error");
    logger.error(`${diag.title} — abandon après ${maxAttempts} tentative(s).`, "fca");
    logger.error(`Action requise : ${diag.action}`, "fca");
    await notifyOwner(app, `⛔ Connexion Facebook impossible\n\n${diag.title} : ${diag.detail}\n\n🛠️ ${diag.action}`);
    return { ok: false, error: { ...diag, technical: sanitize(formatError(lastError || new Error("unknown"))) } };
  }

  // 5. Identité du bot.
  app.setBot(bot);
  let botUserID = app.getBotUserID();
  if (!botUserID && bot.api && typeof bot.api.getCurrentUserID === "function") {
    try {
      botUserID = await new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
          if (!done) {
            done = true;
            resolve("");
          }
        }, 10000);
        try {
          const value = bot.api.getCurrentUserID((err, id) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(err ? "" : String(id || ""));
          });
          if (value && !done) {
            done = true;
            clearTimeout(timer);
            resolve(String(value));
          }
        } catch {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve("");
          }
        }
      });
      if (botUserID) app.runtime.botUserID = botUserID;
    } catch {
      /* non bloquant */
    }
  }

  // 6. Dispatcher + écoute.
  dispatcher.attach(bot);
  bot.startListening();
  app.setStatus("online");

  const registryErrors = registry.errors();
  logger.success(
    `${config.identity.name} v${config.identity.version} en ligne — ${registry.count()} commande(s), ` +
      `${services.users.count()} utilisateur(s), ${services.groups.count()} conversation(s).`,
    "bot"
  );
  if (registryErrors.length) {
    logger.warn(`${registryErrors.length} fichier(s) de commande en erreur (voir ci-dessus).`, "registry");
  }
  if (!config.owner.uid) {
    logger.warn("Aucun OWNER_UID défini : les commandes d'administration restent inaccessibles.", "config");
  }
  if (botUserID) logger.info(`UID du compte bot : ${botUserID}`, "bot");

  services.logs.info("bot", `Démarrage réussi — ${registry.count()} commandes, UID bot ${botUserID || "inconnu"}`);

  // 7. Événements de session (expiration, checkpoint, limite de débit…).
  attachEmitterHandlers(app, bot);

  // 8. Notification du propriétaire.
  if (config.notifications.ownerOnReady) {
    await notifyOwner(
      app,
      `🔵 ${config.identity.name} v${config.identity.version} est en ligne.\n\n` +
        `⚙️ ${registry.count()} commandes chargées\n` +
        `👥 ${services.groups.count()} conversation(s) suivie(s)\n` +
        `📊 ${services.stats.data().totalCommands} commande(s) exécutée(s) au total\n` +
        `💾 Données : ${config._meta.dataDir}${store.remoteEnabled() ? " + snapshot distant" : " (disque local)"}`
    );
  }

  // 9. Signaux d'arrêt (Render envoie SIGTERM).
  installSignalHandlers(app);

  return { ok: true, bot, botUserID };
}

/** Surveille les événements de session émis par la librairie. */
function attachEmitterHandlers(app, bot) {
  const { config, logger, services, permissions } = app;
  const emitter = (bot.ctx && bot.ctx._emitter) || (bot._emitter ?? null);
  if (!emitter || typeof emitter.on !== "function") {
    logger.warn("Émetteur de session introuvable : la surveillance des coupures est limitée.", "fca");
    return;
  }

  const handlers = {
    sessionExpired: () => handleSessionLoss(app, "session expirée", "Remplace account.txt par un appState frais."),
    checkpoint: () => handleSessionLoss(app, "checkpoint Facebook", "Valide la vérification du compte puis régénère les cookies."),
    checkpoint_282: () => handleSessionLoss(app, "checkpoint 282", "Valide la vérification du compte puis régénère les cookies."),
    checkpoint_956: () => handleSessionLoss(app, "checkpoint 956", "Valide la vérification du compte puis régénère les cookies."),
    loginBlocked: () => handleSessionLoss(app, "connexion bloquée", "Facebook bloque cette session : régénère les cookies."),
    account_inactive: () => handleSessionLoss(app, "compte inactif", "Le compte est désactivé : utilise un autre compte."),
    rateLimit: () => {
      logger.warn("Limite de débit atteinte côté Facebook : le bot ralentit ses envois.", "fca");
      services.logs.warn("fca", "Limite de débit Facebook atteinte");
    },
    networkError: (payload) => {
      logger.warn(`Erreur réseau MQTT : ${sanitize(String((payload && payload.message) || payload || ""))}`, "fca");
    }
  };

  for (const [name, handler] of Object.entries(handlers)) {
    emitter.on(name, (payload) => {
      try {
        handler(payload);
      } catch (err) {
        logger.error(`Gestionnaire "${name}" : ${err.message}`, "fca");
      }
    });
  }

  // Filet supplémentaire : toute erreur non classée de la librairie.
  if (typeof bot.on === "function") {
    bot.on("error", (err) => {
      logger.error(`Erreur librairie : ${sanitize(String((err && err.message) || err))}`, "fca");
      services.stats.recordError({ scope: "fca", message: sanitize(String((err && err.message) || err)).slice(0, 200) });
    });
  }

  if (config && permissions) logger.debug("Surveillance de session activée.", "fca");
}

/** Perte de session : journalisation, notification, arrêt net (pas de boucle). */
async function handleSessionLoss(app, reason, action) {
  const { logger, services, runtime } = app;
  if (runtime.status === "stopped") return;
  runtime.status = "error";

  logger.error(`Perte de connexion (${reason}). ${action}`, "fca");
  services.logs.error("fca", `Perte de connexion : ${reason}`, {});
  await notifyOwner(app, `⛔ Connexion perdue : ${reason}\n\n🛠️ ${action}`);

  try {
    await app.store.flushAll();
  } catch {
    /* non bloquant */
  }
  // Arrêt net : Render relance le service avec un état propre.
  logger.warn("Arrêt du processus pour permettre un redémarrage propre.", "fca");
  setTimeout(() => process.exit(1), 1000).unref?.();
}

/** Notifie le propriétaire sans jamais bloquer le démarrage. */
async function notifyOwner(app, message) {
  try {
    if (!app.config.owner.uid) return false;
    return await app.permissions.sendOwnerMessage(message);
  } catch (err) {
    app.logger.warn(`Notification propriétaire impossible : ${err.message}`, "bot");
    return false;
  }
}

/** SIGINT / SIGTERM : sauvegarde puis sortie. */
function installSignalHandlers(app) {
  const { logger } = app;
  let stopping = false;

  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info(`Signal ${signal} reçu.`, "bot");
    try {
      await app.shutdown(signal);
    } catch (err) {
      logger.error(`Arrêt anormal : ${err.message}`, "bot");
    }
    setTimeout(() => process.exit(0), 200).unref?.();
  };

  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("beforeExit", () => {
    // Dernière chance d'écrire les données en mémoire.
    app.store.flushAll().catch(() => undefined);
  });
}

module.exports = { start, buildFcaOptions, diagnose, notifyOwner, FCA_OPTION_KEYS };
