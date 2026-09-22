"use strict";

/**
 * core/bot.js
 * ---------------------------------------------------------------------------
 * Conteneur d'application : construit la configuration, le logger, la
 * persistance, TOUS les services, puis le registre de commandes, les gardes de
 * sécurité et le dispatcher.
 *
 * Aucune logique métier ici : ce module assemble et câble. C'est ce qui permet
 * de tester chaque service isolément (utils/selftest.js) et de remplacer un
 * module sans toucher au reste.
 * ---------------------------------------------------------------------------
 */

const path = require("path");

const { loadConfig, ensureFcaConfig, ROOT_DIR } = require("../utils/config");
const { createLogger, formatError } = require("../utils/logger");
const text = require("../utils/text");
const random = require("../utils/random");
const math = require("../utils/math");
const helpers = require("../utils/helpers");

const { createStoreManager } = require("../services/store");
const { createUsers } = require("../services/users");
const { createEconomy } = require("../services/economy");
const { createXp } = require("../services/xp");
const { createGroups } = require("../services/groups");
const { createSettings } = require("../services/settings");
const { createWarnings } = require("../services/warnings");
const { createStats } = require("../services/stats");
const { createLogs } = require("../services/logs");
const { createGames } = require("../services/games");
const { createConversation } = require("../services/conversation");
const { createScheduler } = require("../services/scheduler");
const { createExternal } = require("../services/external");

const { createPermissions } = require("../utils/permissions");
const { createRegistry } = require("./registry");
const { createGuard } = require("./guard");
const { createErrorHandler } = require("./errors");
const { createContextBuilder } = require("./context");
const { createDispatcher } = require("./dispatcher");

/**
 * @param {{ env?: NodeJS.ProcessEnv, rootDir?: string, quiet?: boolean }} [options]
 */
function createBotApp(options = {}) {
  const env = options.env || process.env;
  const rootDir = options.rootDir || ROOT_DIR;
  const startedAt = Date.now();

  // 1. Configuration + réglages librairie (avant tout require de fca).
  const bootLogger = createLogger({ level: "info", colors: Boolean(process.stdout.isTTY) });
  ensureFcaConfig({ rootDir, logger: options.quiet ? null : bootLogger });
  const config = loadConfig({ env, rootDir, logger: options.quiet ? null : bootLogger });

  // 2. Logger définitif (niveau issu de la configuration).
  const logger = options.quiet
    ? { level: "silent", silent: true, debug() {}, info() {}, warn() {}, error() {}, success() {}, banner() {}, addSink() { return this; }, sanitize: (v) => v, formatError }
    : createLogger({ level: config.logging.level, file: config.logging.file, colors: Boolean(process.stdout.isTTY) });

  text.configure({ ...config.identity, width: 34 });

  // 3. Persistance.
  const dataDir = config._meta.dataDir;
  const store = createStoreManager({
    dir: dataDir,
    logger,
    flushIntervalMs: config.storage.flushIntervalMs,
    snapshotIntervalMs: config.storage.snapshotIntervalMs,
    remote: config.storage.remote
  });

  // 4. Détenteurs mutables (l'API Facebook n'existe qu'après connexion).
  const runtime = { api: null, bot: null, botUserID: "", health: null, status: "starting" };
  const getApi = () => runtime.api;
  const getBot = () => runtime.bot;
  const getBotUserID = () => runtime.botUserID;

  // 5. Services (ordre = dépendances).
  const stats = createStats({ store, config, logger });
  const logs = createLogs({ store, config, logger });
  logs.attach(logger);

  const users = createUsers({ store, config, logger });
  const economy = createEconomy({ store, config, logger });

  const permissions = createPermissions({
    getConfig: () => config,
    getApi,
    logger,
    getUserRole: (userID) => users.roleOf(userID)
  });

  const warnings = createWarnings({ store, config, logger, permissions });
  const xp = createXp({ users, config, logger });
  const groups = createGroups({ store, config, logger, getApi });
  const settings = createSettings({ store, config, logger });

  const registry = createRegistry({
    dir: path.join(rootDir, "commands"),
    logger,
    getPrefix: () => config.prefix
  });

  const games = createGames({ config, logger, users, xp, economy });

  const conversation = createConversation({ config, logger, stats, registry });

  const external = createExternal({ config, logger });

  /** Envoi d'un rappel arrivé à échéance. */
  async function fireReminder(reminder) {
    if (!runtime.api) return;
    const when = new Date(Number(reminder.at)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    const body = text.lightBox("RAPPEL", [
      `⏰ ${reminder.text || "Rappel"}`,
      "",
      `Programmé le ${when} pour ${users.getName(reminder.userID) || reminder.userID}.`
    ]);
    try {
      await runtime.api.sendMessage(body, String(reminder.threadID), () => {});
      logs.info("scheduler", `Rappel ${reminder.id} envoyé (thread ${reminder.threadID})`, { threadID: reminder.threadID, userID: reminder.userID });
    } catch (err) {
      logger.warn(`Rappel ${reminder.id} non envoyé : ${err.message}`, "scheduler");
    }
  }

  const scheduler = createScheduler({ store, config, logger, onFire: fireReminder, tickMs: 5000 });

  const services = {
    store,
    users,
    economy,
    xp,
    groups,
    settings,
    warnings,
    stats,
    logs,
    games,
    conversation,
    scheduler,
    external
  };

  // 6. Sécurité, erreurs, contexte, dispatcher.
  const errors = createErrorHandler({
    logger,
    stats,
    logs,
    text,
    send: async (payload, threadID) => {
      if (!runtime.api) return false;
      try {
        await runtime.api.sendMessage(payload, String(threadID), () => {});
        return true;
      } catch (err) {
        logger.warn(`Message d'erreur non envoyé : ${err.message}`, "errors");
        return false;
      }
    },
    onFatal: async () => {
      await shutdown("erreur fatale répétée");
    }
  });

  const guard = createGuard({ config, logger, permissions, warnings, stats });

  const context = createContextBuilder({
    config,
    logger,
    services,
    registry,
    permissions,
    guard,
    errors,
    text,
    random,
    math,
    getApi,
    getBot,
    getBotUserID
  });

  const dispatcher = createDispatcher({
    config,
    logger,
    text,
    services,
    registry,
    permissions,
    guard,
    errors,
    context,
    getApi,
    getBot,
    getBotUserID
  });

  // 7. Chargement des commandes.
  const loadResult = registry.load();

  /** Extinction propre : données écrites, minuteurs arrêtés. */
  async function shutdown(reason = "arrêt demandé") {
    if (runtime.status === "stopped") return;
    runtime.status = "stopped";
    logger.info(`Arrêt en cours (${reason})…`, "bot");
    scheduler.stop();
    store.stopTimers();
    try {
      if (runtime.bot && typeof runtime.bot.stop === "function") await runtime.bot.stop();
    } catch (err) {
      logger.warn(`Arrêt du bot : ${err.message}`, "bot");
    }
    try {
      if (runtime.health && typeof runtime.health.stop === "function") await runtime.health.stop();
    } catch {
      /* non bloquant */
    }
    try {
      await store.shutdown();
    } catch (err) {
      logger.error(`Sauvegarde finale échouée : ${err.message}`, "bot");
    }
    logger.success("Arrêt terminé, données sauvegardées.", "bot");
  }

  /** État global (health endpoint, /botinfo, /stats). */
  function status() {
    return {
      status: runtime.status,
      startedAt,
      uptimeMs: Date.now() - startedAt,
      botUserID: runtime.botUserID,
      commands: registry.count(),
      commandErrors: registry.errors().length,
      users: users.count(),
      groups: groups.count(),
      storage: store.stats(),
      dispatcher: dispatcher.stats(),
      services: external.readiness(),
      dataDir
    };
  }

  return {
    config,
    logger,
    text,
    random,
    math,
    helpers,
    store,
    services,
    registry,
    permissions,
    guard,
    errors,
    context,
    dispatcher,
    runtime,
    getApi,
    getBot,
    getBotUserID,
    setApi(api) {
      runtime.api = api;
    },
    setBot(bot) {
      runtime.bot = bot;
      if (bot && bot.ctx) {
        runtime.api = bot.api || (bot.ctx && bot.ctx.api) || runtime.api;
        const userID = bot.ctx && (bot.ctx.userID || bot.ctx.fbid);
        if (userID) runtime.botUserID = String(userID);
      }
    },
    setHealth(health) {
      runtime.health = health;
    },
    setStatus(value) {
      runtime.status = value;
    },
    shutdown,
    status,
    startedAt
  };
}

module.exports = { createBotApp };
