"use strict";

/**
 * /eval — exécution de JavaScript dans le contexte du bot.
 *
 * Commande la plus dangereuse du projet : elle est verrouillée à trois niveaux.
 *   1. permissions: "owner"      → seul le propriétaire configuré (OWNER_UID) ;
 *   2. config.security.allowEval → false par défaut, FORCÉ à false en
 *                                  production sauf ALLOW_EVAL=true explicite ;
 *   3. filtre de contenu         → toute référence à des identifiants de
 *                                  session (cookies, appState, account.txt,
 *                                  mots de passe, clés API) est refusée AVANT
 *                                  exécution, et la sortie est nettoyée.
 *
 * La configuration exposée au code est une copie expurgée de ses secrets.
 */

const util = require("util");
const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { sanitize } = require("../../utils/logger");
const { FORBIDDEN_EVAL } = require("../../utils/moderation");

const TIMEOUT_MS = 5000;
const MAX_OUTPUT = 1800;
const MAX_CODE = 1200;

/** Copie de la configuration sans aucun secret (clés, jetons, proxy). */
function safeConfig(config) {
  return {
    ...config,
    ai: { ...(config.ai || {}), apiKey: "", imageApiKey: "", baseUrl: (config.ai && config.ai.baseUrl) || "" },
    media: { ...(config.media || {}), apiToken: "", youtubeApiKey: "" },
    connection: { ...(config.connection || {}), proxy: "" },
    storage: { ...(config.storage || {}), url: "", token: "" }
  };
}

module.exports = {
  name: "eval",
  aliases: ["exec", "js", "run"],
  category: "admin",
  description: "Exécute du JavaScript dans le contexte du bot (propriétaire uniquement, désactivé en production).",
  usage: "/eval <code JavaScript>",
  examples: ["/eval 1 + 1", "/eval return services.users.count()", "/eval await new Promise(r => setTimeout(r, 100))"],
  permissions: "owner",
  cooldown: 5,
  hidden: true,

  async execute(ctx, bag) {
    const { config, logger } = bag;

    if (!config.security.allowEval) {
      return lightBox("EVAL — DÉSACTIVÉ", [
        `${ICONS.lock} /eval est désactivé sur ce déploiement.`,
        "",
        `${ICONS.info} Environnement : ${config._meta.env}. En production, la commande est forcée à off.`,
        `${ICONS.pin} Pour l'activer (dépannage uniquement) : variable ALLOW_EVAL=true puis redémarrage.`,
        `${ICONS.info} Rien n'est exécuté tant que ce verrou est actif.`
      ]);
    }

    const code = ctx.argString.trim();
    if (!code) {
      return lightBox("EVAL", [
        `${ICONS.warn} Aucun code fourni.`,
        "",
        `${ICONS.pin} ${cmd("eval 1 + 1", ctx.prefix)}`,
        `${ICONS.pin} ${cmd("eval return services.users.count()", ctx.prefix)}`,
        `${ICONS.pin} Disponible : services, config (expurgée), text, random, math, ctx, require, await`
      ]);
    }
    if (code.length > MAX_CODE) return lightBox("EVAL", [`${ICONS.warn} Code trop long (${MAX_CODE} caractères maximum).`]);

    if (FORBIDDEN_EVAL.test(code)) {
      bag.logs.warn("security", "Tentative /eval refusée : référence à des identifiants sensibles.", { userID: ctx.senderID, threadID: ctx.threadID, command: "eval" });
      return lightBox("EVAL — REFUSÉ", [
        `${ICONS.no} Le code référence des identifiants de session ou des secrets (cookies, account.txt, clés API…).`,
        "",
        `${ICONS.info} L'exécution est refusée avant même de commencer, et la tentative est journalisée.`
      ]);
    }

    // Sortie console capturée (déclarée avant la portée qui la référence).
    const lines = [];

    // Portée d'exécution : aucune donnée sensible n'est injectée.
    const scope = {
      ctx,
      services: bag.services,
      config: safeConfig(config),
      text: bag.text,
      random: bag.random,
      math: bag.math,
      permissions: bag.permissions,
      registry: bag.registry,
      require,
      Buffer,
      process: { env: {}, version: process.version, platform: process.platform, uptime: () => Math.round(process.uptime()) },
      console: { log: (...args) => lines.push(args.map((a) => util.inspect(a, { depth: 2 })).join(" ")) }
    };

    const needsReturn = /\breturn\b/.test(code);
    const body = needsReturn
      ? code
      : /[\n;]/.test(code)
        ? `${code}\nreturn undefined;`
        : `return (${code});`;

    let result;
    let error = null;
    const started = Date.now();

    try {
      // eslint-disable-next-line no-new-func
      const runner = new Function(...Object.keys(scope), `return (async () => { ${body} })();`);
      const value = runner(...Object.values(scope));
      result = await Promise.race([
        Promise.resolve(value),
        new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), TIMEOUT_MS + 50))
      ]);
      if (result === TIMEOUT) error = new Error(`Exécution interrompue : délai de ${TIMEOUT_MS / 1000} s dépassé.`);
    } catch (err) {
      error = err;
    }

    const elapsed = Date.now() - started;
    bag.logs.info("admin", `Exécution /eval (${elapsed} ms, ${error ? "échec" : "succès"}).`, { userID: ctx.senderID, threadID: ctx.threadID, command: "eval" });

    if (error) {
      logger.warn(`/eval en échec : ${sanitize(error.message)}`, "admin");
      return lightBox("EVAL — ERREUR", [
        `${ICONS.error} ${sanitize(error.name || "Error")}: ${sanitize(error.message).slice(0, 300)}`,
        "",
        `${ICONS.time} ${elapsed} ms`,
        `${ICONS.info} La sortie reste dans le contexte du bot : rien n'est exposé publiquement.`
      ]);
    }

    let output;
    try {
      output = typeof result === "string" ? result : util.inspect(result, { depth: 2, breakLength: 96, maxArrayLength: 40 });
    } catch {
      output = String(result);
    }
    output = sanitize(lines.length ? `${lines.join("\n")}\n${output}` : output).slice(0, MAX_OUTPUT);

    return box("EVAL", [
      `${ICONS.bolt} Code : ${sanitize(code).slice(0, 200)}`,
      "",
      output.trim() ? output : "(aucune valeur retournée)",
      lines.length ? "" : null,
      "",
      `${ICONS.time} ${elapsed} ms • sortie nettoyée (secrets masqués)`
    ].filter((line) => line !== null));
  }
};

/** Sentinelle de dépassement de délai. */
const TIMEOUT = Symbol("timeout");
