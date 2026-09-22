"use strict";

/**
 * core/dispatcher.js
 * ---------------------------------------------------------------------------
 * LE point d'entrée unique de tous les messages (`bot.use(...)`).
 *
 * Pourquoi un seul middleware plutôt que `bot.command()` ?
 *   • le préfixe est configurable PAR GROUPE (settings.prefixFor) ;
 *   • le cas particulier du message « / » seul doit être traité avant tout ;
 *   • cooldowns, anti-spam, bannissements et permissions passent au même
 *     endroit, donc aucune commande ne peut les contourner ;
 *   • la conversation naturelle et les mentions sont gérées après les
 *     commandes, sans jamais se déclencher sur une commande.
 *
 * Ordre de traitement :
 *   1. événement exploitable ?  2. doublon ?  3. message du bot ?
 *   4. banni / muet ?  4b. mode maintenance ?  5. anti-flood ?  6. activité + XP
 *   7. anti-lien (groupes)      8. préfixe seul → message « disponible »
 *   9. commande connue → garde + exécution   10. commande inconnue → aide
 *  11. mention du bot → réponse   12. conversation naturelle (probabilité)
 *
 * Les événements de groupe (arrivée/départ de membres) n'entrent PAS dans le
 * composer de la librairie : ils sont traités par handleThreadEvent(), branché
 * sur bot.on("threadUpdate").
 * ---------------------------------------------------------------------------
 */

const { createDedupeStore, closestMatch, normalizeUID, formatDuration } = require("../utils/helpers");
const { pick } = require("../utils/random");
const i18n = require("../utils/i18n");

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/** Regex de détection de liens (http, www, domaines courts connus). */
const LINK_RE =
  /(\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+|\b(?:t\.me|bit\.ly|tinyurl\.com|is\.gd|discord\.gg|wa\.me|telegram\.me|shorte\.st)\/[^\s<>"']+)/i;

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} [deps.logger]
 * @param {object} deps.text
 * @param {object} deps.services
 * @param {object} deps.registry
 * @param {object} deps.permissions
 * @param {object} deps.guard
 * @param {object} deps.errors
 * @param {object} deps.context
 * @param {() => object|null} deps.getApi
 * @param {() => object|null} deps.getBot
 * @param {() => string} deps.getBotUserID
 */
function createDispatcher(deps = {}) {
  const { config, text, services, registry, permissions, guard, errors, context } = deps;
  const logger = deps.logger || noopLogger;
  const getApi = deps.getApi || (() => null);
  const getBotUserID = deps.getBotUserID || (() => "");

  const dedupe = createDedupeStore({
    ttlMs: Math.max(30000, Number(config.limits.dedupeTtlMs) || 300000),
    max: 5000
  });

  /** Anti-spam du message de maintenance : threadID → dernier horodatage. */
  const maintenanceNotices = new Map();
  const MAINTENANCE_NOTICE_TTL_MS = 10 * 60 * 1000;

  const counters = {
    messages: 0,
    commands: 0,
    unknown: 0,
    mentions: 0,
    conversation: 0,
    blocked: 0,
    moderated: 0,
    ignored: 0
  };

  // -------------------------------------------------------------------------
  // Messages prédéfinis
  // -------------------------------------------------------------------------

  /**
   * Le message « / » seul : le bot se déclare disponible (4 variantes).
   * Traduit selon la langue de la conversation (utils/i18n.js).
   */
  function availableMessages(language, prefix) {
    return i18n.sayVariants(
      "available",
      language,
      {
        name: config.identity.name,
        version: config.identity.version,
        count: registry.count(),
        prefix: String(prefix || config.prefix || "/"),
        palette: config.identity.palette
      },
      { palette: text.theme.palette }
    );
  }

  /** Commande inconnue : message propre + suggestion la plus proche. */
  function unknownCommandMessage(name, language, prefix) {
    const clean = String(name || "").slice(0, 24);
    const effective = String(prefix || config.prefix || "/");
    return i18n.say(
      "unknown",
      language,
      { command: clean, suggestion: closestMatch(clean, registry.searchableNames(), 3) || "", prefix: effective },
      { palette: text.theme.palette }
    );
  }

  // -------------------------------------------------------------------------
  // Modération de contenu
  // -------------------------------------------------------------------------

  /** Un lien est-il autorisé dans ce groupe ? */
  function isAllowedLink(url, settings) {
    const allowed = Array.isArray(config.moderation.allowedLinkDomains) ? config.moderation.allowedLinkDomains : [];
    const local = Array.isArray(settings && settings.allowedLinkDomains) ? settings.allowedLinkDomains : [];
    const domains = [...allowed, ...local];
    if (!domains.length) return false;
    let host = "";
    try {
      host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      host = "";
    }
    if (!host) return false;
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }

  /**
   * Anti-lien : supprime le message et avertit l'auteur (groupes uniquement).
   * @returns {Promise<boolean>} true si une action a été prise
   */
  async function enforceAntiLink({ body, threadID, senderID, messageID, settings, isGroup, groupAdminIDs }) {
    if (!settings || !settings.antilink || !isGroup) return false;
    const match = String(body || "").match(LINK_RE);
    if (!match) return false;
    const url = match[0];
    if (isAllowedLink(url, settings)) return false;
    if (permissions.isGroupAdmin(senderID, groupAdminIDs)) return false;

    counters.moderated += 1;
    const api = getApi();

    if (api && typeof api.unsendMessage === "function" && messageID) {
      try {
        await api.unsendMessage(messageID, () => {});
      } catch (err) {
        logger.debug(`unsendMessage refusé : ${err.message}`, "dispatcher");
      }
    }

    const warnResult = services.warnings.addWarn(threadID, senderID, "lien non autorisé (antilink)", getBotUserID());
    if (services.stats) services.stats.recordModeration();

    const name = services.users.getName(senderID) || senderID;
    const lines = [
      `${text.ICONS.no} ${name}, les liens ne sont pas autorisés ici.`,
      `Lien retiré : ${text.cut(url, 60)}`,
      "",
      `⚠️ Avertissement ${warnResult.total || 1}/${warnResult.max || config.limits.maxWarns}`
    ];
    if (warnResult.autoAction) {
      lines.push(`🔇 Sanction automatique : muet pendant ${warnResult.autoAction.minutes} minutes.`);
    }
    await sendText(threadID, text.warn("ANTI-LIEN", lines.join("\n")));
    return true;
  }

  // -------------------------------------------------------------------------
  // Envoi protégé
  // -------------------------------------------------------------------------

  /**
   * Mode du bot (/setstatus) : maintenance ou silencieux.
   *
   * En maintenance, seuls les administrateurs du bot obtiennent une réponse ;
   * un message d'explication est envoyé au plus une fois par conversation et
   * par tranche de 10 minutes (jamais de spam).
   */
  function checkStatus({ threadID, senderID, language }) {
    let status;
    try {
      status = services.settings.status();
    } catch (err) {
      logger.warn(`Mode du bot illisible : ${err.message}`, "dispatcher");
      return { blocked: false, mode: "actif" };
    }

    const mode = String(status.mode || "actif");
    if (mode === "actif") return { blocked: false, mode };

    if (mode === "maintenance" && !permissions.isAdmin(senderID)) {
      const now = Date.now();
      const last = maintenanceNotices.get(threadID) || 0;
      if (now - last < MAINTENANCE_NOTICE_TTL_MS) return { blocked: true, mode, silent: true };
      maintenanceNotices.set(threadID, now);
      return {
        blocked: true,
        mode,
        message: i18n.say("maintenance", language, { icon: status.icon, text: status.text || "" }, { palette: text.theme.palette })
      };
    }

    // silencieux : les commandes restent autorisées, la conversation est coupée.
    return { blocked: false, mode };
  }

  async function sendText(threadID, payload) {
    const api = getApi();
    if (!api || typeof api.sendMessage !== "function" || !threadID) return false;
    const { rawSend } = context;
    try {
      return await rawSend(payload, threadID);
    } catch (err) {
      logger.warn(`Envoi impossible : ${err.message}`, "dispatcher");
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Middleware principal
  // -------------------------------------------------------------------------

  async function middleware(rawCtx) {
    const event = (rawCtx && rawCtx.event) || {};
    const type = String(event.type || "");
    if (type !== "message" && type !== "message_reply") return;

    counters.messages += 1;
    const body = typeof event.body === "string" ? event.body : "";
    const threadID = String(rawCtx.threadID || event.threadID || "");
    const senderID = String(rawCtx.senderID || event.senderID || "");
    const messageID = String(rawCtx.messageID || event.messageID || "");
    const botUserID = getBotUserID();

    // 1-3. Garde-fous immédiats.
    if (!threadID || !senderID) {
      counters.ignored += 1;
      return;
    }
    if (messageID && dedupe.isDuplicate(messageID)) {
      counters.ignored += 1;
      logger.debug(`Doublon ignoré (messageID ${messageID}).`, "dispatcher");
      return;
    }
    if (botUserID && senderID === botUserID) {
      counters.ignored += 1;
      return; // ne jamais répondre à ses propres messages (anti-boucle)
    }

    // Réglages de la conversation (lus une seule fois) + langue système.
    const settings = services.settings.get(threadID);
    const prefix = services.settings.prefixFor(threadID);
    const language = i18n.resolveLanguage(settings.language);

    // 4. Bannissement / mute.
    const moderation = guard.checkModeration({ threadID, senderID, language });
    if (moderation.blocked) {
      counters.blocked += 1;
      if (moderation.message) await sendText(threadID, moderation.message);
      return;
    }

    // 4b. Mode du bot (maintenance / silencieux) — piloté par /setstatus.
    const botStatus = checkStatus({ threadID, senderID, language });
    if (botStatus.blocked) {
      counters.blocked += 1;
      if (botStatus.message && !botStatus.silent) await sendText(threadID, botStatus.message);
      return;
    }

    // 5. Anti-flood (si activé pour cette conversation).
    const trimmed = body.trim();
    const looksLikeCommand = trimmed.startsWith(prefix);

    if (settings.antispam !== false) {
      const flood = guard.checkFlood({ senderID, isCommand: looksLikeCommand, language });
      if (flood.flooded) {
        counters.blocked += 1;
        if (flood.message && !flood.silent) await sendText(threadID, flood.message);
        return;
      }
    }

    // 6. Activité, statistiques et XP (throttlé).
    try {
      services.users.addMessage(senderID);
      if (event.senderName) services.users.setName(senderID, event.senderName);
      services.groups.recordActivity(threadID, { name: "" });
      if (services.stats) services.stats.recordMessage({ threadID, userID: senderID });
      if (services.xp) services.xp.onMessage(senderID);
    } catch (err) {
      logger.warn(`Suivi d'activité échoué : ${err.message}`, "dispatcher");
    }

    // Informations de conversation (cache) : groupe, admins, nom.
    const info = await services.groups.threadInfo(threadID);
    const isGroup = Boolean(info && info.ok && info.isGroup);
    const groupAdminIDs = info && info.ok && Array.isArray(info.adminIDs) ? info.adminIDs : [];
    const threadName = (info && info.ok && info.name) || "";
    if (threadName) services.groups.update(threadID, { name: threadName, isGroup });

    // 7. Anti-lien (groupes).
    if (await enforceAntiLink({ body, threadID, senderID, messageID, settings, isGroup, groupAdminIDs })) {
      return;
    }

    // 8. Préfixe seul → « bot disponible ».
    if (trimmed === prefix || (looksLikeCommand && trimmed.slice(prefix.length).trim() === "")) {
      await sendText(threadID, pick(availableMessages(language, prefix)));
      if (services.stats) services.stats.recordCommand("available", { threadID, userID: senderID });
      return;
    }

    // 9-10. Commandes.
    if (looksLikeCommand) {
      await handleCommand({
        rawCtx,
        event,
        body: trimmed.slice(prefix.length).trim(),
        threadID,
        senderID,
        messageID,
        prefix,
        language,
        isGroup,
        threadName,
        groupAdminIDs,
        settings,
        info
      });
      return;
    }

    // 11-12. Mention et conversation naturelle (coupée en mode silencieux).
    if (settings.conversation !== false && botStatus.mode !== "silencieux") {
      await handleNaturalMessage({
        rawCtx,
        body,
        threadID,
        senderID,
        isGroup,
        threadName,
        groupAdminIDs,
        settings,
        prefix,
        info
      });
    }
  }

  /** Exécute une commande (connue ou non). */
  async function handleCommand(params) {
    const { rawCtx, event, body, threadID, senderID, prefix, language, isGroup, threadName, groupAdminIDs, settings, info } = params;

    const tokens = body.split(/\s+/);
    const rawName = String(tokens.shift() || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const argString = tokens.join(" ");

    if (!rawName) {
      await sendText(threadID, pick(availableMessages(language, prefix)));
      return;
    }

    const command = registry.resolve(rawName);
    if (!command) {
      counters.unknown += 1;
      if (services.stats) services.stats.recordUnknown(rawName);
      await sendText(threadID, unknownCommandMessage(rawName, language, prefix));
      return;
    }

    // Cooldown puis permissions (le cooldown n'est consommé que si l'accès est accordé).
    const cooldown = guard.checkCooldown({ senderID, threadID, command, consume: false, language });
    if (!cooldown.ok && cooldown.message) {
      await sendText(threadID, cooldown.message);
      return;
    }

    const access = guard.checkAccess({
      command,
      ctx: { senderID, threadID },
      isGroup,
      groupAdminIDs,
      language
    });
    if (!access.ok) {
      counters.blocked += 1;
      if (access.message) await sendText(threadID, access.message);
      if (services.logs) {
        services.logs.warn(
          "permissions",
          `Accès refusé : /${command.name} par ${senderID} (thread ${threadID})`,
          { userID: senderID, threadID, command: command.name }
        );
      }
      return;
    }

    const consumed = guard.checkCooldown({ senderID, threadID, command, consume: true, language });
    if (!consumed.ok) {
      if (consumed.message) await sendText(threadID, consumed.message);
      return;
    }

    const { ctx, bag } = context.build(rawCtx, {
      command,
      args: bagArgs(argString),
      argString,
      prefix,
      isGroup,
      threadName,
      groupAdminIDs,
      participantIDs: (info && info.participantIDs) || [],
      memberCount: (info && info.memberCount) || 0,
      settings,
      startedAt: Date.now()
    });

    counters.commands += 1;
    if (services.stats) {
      services.stats.recordCommand(command.name, { category: command.category, threadID, userID: senderID });
    }
    if (services.users) {
      services.users.addCommand(senderID, command.name, command.category);
      if (event.senderName) services.users.setName(senderID, event.senderName);
    }
    if (services.groups) services.groups.recordActivity(threadID, { isGroup, name: threadName, isCommand: true });
    if (services.xp) services.xp.onCommand(senderID);

    try {
      if (command.typing) await ctx.typing(900).catch(() => false);
      const result = await command.execute(ctx, bag);
      if (typeof result === "string" && result.trim()) await ctx.send(result);
      else if (result && typeof result === "object" && typeof result.body === "string") await ctx.send(result);
    } catch (err) {
      // Une erreur de commande ne doit JAMAIS faire tomber le bot.
      guard.releaseCooldown(senderID, command);
      await errors.handle(err, { command, ctx, scope: `command:${command.name}`, language });
    }
  }

  /** Découpe les arguments en respectant les guillemets. */
  function bagArgs(argString) {
    const input = String(argString || "").trim();
    if (!input) return [];
    const tokens = [];
    let current = "";
    let inQuotes = false;
    for (const char of input) {
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && /\s/.test(char)) {
        if (current) tokens.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    if (current) tokens.push(current);
    return tokens.slice(0, 30);
  }

  /** Mention du bot + conversation naturelle. */
  async function handleNaturalMessage(params) {
    const { rawCtx, body, threadID, senderID, isGroup, threadName, groupAdminIDs, settings, prefix } = params;
    const botUserID = getBotUserID();

    const mention = services.conversation.isMention(body, {
      botUserID,
      mentionedUserIDs: [],
      raw: body
    });

    const decision = services.conversation.canReply({
      threadID,
      senderID,
      text: body,
      isGroup,
      isSelf: false,
      isCommand: false,
      mention,
      isBanned: services.warnings.isBanned(senderID)
    });

    if (!decision.reply) return;

    const { ctx, bag } = context.build(rawCtx, {
      command: null,
      args: [],
      argString: "",
      prefix,
      isGroup,
      threadName,
      groupAdminIDs,
      settings,
      startedAt: Date.now()
    });

    let response = null;
    try {
      response = services.conversation.respond({
        text: body,
        threadID,
        senderID,
        userName: ctx.senderName || services.users.getName(senderID) || "",
        isGroup,
        mention: Boolean(decision.mention || mention),
        prefix,
        commandCount: registry.count()
      });
    } catch (err) {
      logger.warn(`Conversation échouée : ${err.message}`, "dispatcher");
      return;
    }

    if (!response) return;

    if (mention) counters.mentions += 1;
    else counters.conversation += 1;

    const sent = await sendText(threadID, response);
    if (sent) {
      services.conversation.markReplied(threadID, senderID);
      if (services.stats) {
        if (mention) services.stats.recordMention();
        else services.stats.recordConversation();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Événements de groupe (arrivée / départ / renommage)
  // -------------------------------------------------------------------------

  /**
   * Extrait les identifiants de participants d'un événement de groupe.
   *
   * @dongdev/fca-unofficial v4 envoie des TABLEAUX D'IDENTIFIANTS
   * (`addedParticipants: ["1000...", ...]`, `leftParticipantFbId: [...]`),
   * tandis que d'autres versions envoient des objets `{ userFbId, fullName }`.
   * Les deux formes sont acceptées : un message de bienvenue ne doit jamais
   * être perdu à cause d'un détail de format.
   */
  function eventParticipantIDs(...sources) {
    const ids = [];
    for (const source of sources) {
      const list = Array.isArray(source) ? source : source === null || source === undefined ? [] : [source];
      for (const entry of list) {
        const id = normalizeUID(
          entry && typeof entry === "object"
            ? entry.userFbId || entry.fbid || entry.id || entry.userID || entry.userFbid || ""
            : entry
        );
        if (id) ids.push(id);
      }
    }
    return [...new Set(ids)];
  }

  /** Nom communiqué par l'événement lui-même (si la librairie le fournit). */
  function eventParticipantName(source, id) {
    const list = Array.isArray(source) ? source : [source];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const entryID = normalizeUID(entry.userFbId || entry.fbid || entry.id || entry.userID || "");
      if (entryID === id && entry.fullName) return String(entry.fullName).slice(0, 80);
    }
    return "";
  }

  /**
   * Traite un événement de thread (le composer de la librairie ne reçoit que
   * les messages : cette fonction est branchée sur bot.on("threadUpdate")).
   */
  async function handleThreadEvent(event) {
    if (!event || event.type !== "event") return;
    const threadID = String(event.threadID || "");
    if (!threadID) return;

    const settings = services.settings.get(threadID);
    const data = event.logMessageData || {};
    const kind = String(event.logMessageType || event.eventType || "");
    const botUserID = getBotUserID();
    const api = getApi();

    const renderContext = { threadName: (services.groups.get(threadID) || {}).name || "ce groupe" };

    try {
      if (kind === "log:subscribe") {
        const eventData = event.eventData || {};
        const added = eventParticipantIDs(data.addedParticipants, eventData.participantsAdded);
        const members = added.filter((id) => id !== botUserID);
        if (!members.length) return;

        services.groups.recordActivity(threadID, { isGroup: true });
        const names = members.map((id) => {
          services.users.get(id);
          const fromEvent = eventParticipantName(data.addedParticipants, id);
          if (fromEvent) services.users.setName(id, fromEvent);
          if (event.author && String(event.author) === id) return "quelqu'un";
          return fromEvent || services.users.getName(id) || id;
        });

        if (settings.welcome) {
          const message = services.settings.render(settings.welcomeMsg, {
            ...renderContext,
            userName: names.join(", "),
            userTag: names.map((n) => `@${n}`).join(" "),
            memberCount: (await services.groups.threadInfo(threadID)).memberCount || ""
          });
          if (message) await sendText(threadID, message);
        }
        if (services.logs) services.logs.info("group", `${members.length} nouveau(x) membre(s) dans ${threadID}`, { threadID });
        return;
      }

      if (kind === "log:unsubscribe") {
        // `leftParticipantFbId` est un TABLEAU dans la v4 (plusieurs départs
        // simultanés possibles) : les trois formes connues sont acceptées.
        const eventData = event.eventData || {};
        const left = eventParticipantIDs(
          data.leftParticipantFbId,
          data.leftParticipants,
          eventData.participantsRemoved
        ).filter((id) => id !== botUserID);
        if (!left.length) return;

        const names = left.map((id) => services.users.getName(id) || eventParticipantName(data.leftParticipants, id) || id);
        if (settings.goodbye) {
          const message = services.settings.render(settings.goodbyeMsg, {
            ...renderContext,
            userName: names.join(", "),
            userTag: names.map((n) => `@${n}`).join(" ")
          });
          if (message) await sendText(threadID, message);
        }
        if (services.logs) services.logs.info("group", `Départ de ${names.join(", ")} (${threadID})`, { threadID, userID: left[0] });
        return;
      }

      if (kind === "log:thread-name" && data.name) {
        services.groups.update(threadID, { name: String(data.name).slice(0, 120) });
        return;
      }
    } catch (err) {
      logger.warn(`Événement de groupe non traité (${kind}) : ${err.message}`, "dispatcher");
    }
  }

  /**
   * Branche le dispatcher sur une instance MessengerBot.
   * @param {object} bot
   */
  function attach(bot) {
    if (!bot || typeof bot.use !== "function") {
      throw new Error("attach() attend une instance MessengerBot (bot.use requis).");
    }
    bot.use(async (ctx) => {
      try {
        await middleware(ctx);
      } catch (err) {
        // Dernier filet : même une panne du middleware ne tue pas le bot.
        logger.error(`Middleware : ${err && err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : err}`, "dispatcher");
        try {
          await errors.handle(err, { ctx, scope: "dispatcher" });
        } catch {
          /* silence */
        }
      }
    });

    if (typeof bot.catch === "function") {
      bot.catch((err, ctx) => {
        errors.handle(err, { ctx, scope: "composer" }).catch(() => undefined);
      });
    }

    if (typeof bot.on === "function") {
      bot.on("threadUpdate", (event) => {
        handleThreadEvent(event).catch((err) => logger.warn(`threadUpdate : ${err.message}`, "dispatcher"));
      });
      bot.on("error", (err) => {
        logger.error(`Événement bot « error » : ${err && err.message ? err.message : err}`, "dispatcher");
      });
    }
    return bot;
  }

  function stats() {
    return { ...counters, dedupe: dedupe.size, guard: guard.state(), conversation: services.conversation.state() };
  }

  function reset() {
    dedupe.clear();
    guard.reset();
    maintenanceNotices.clear();
    services.conversation.reset();
    for (const key of Object.keys(counters)) counters[key] = 0;
  }

  return { middleware, handleCommand, handleNaturalMessage, handleThreadEvent, attach, availableMessages, unknownCommandMessage, stats, reset, counters };
}

module.exports = { createDispatcher, LINK_RE };
