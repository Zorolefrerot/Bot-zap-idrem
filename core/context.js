"use strict";

/**
 * core/context.js
 * ---------------------------------------------------------------------------
 * Construit le contexte enrichi transmis à chaque commande.
 *
 *   execute(ctx, bag)
 *     ctx → le message en cours (threadID, senderID, args, isGroup…) + helpers
 *           d'envoi (reply, send, sendImage, typing, react, mention)
 *     bag → les services partagés (users, economy, xp, games, external…) et les
 *           outils (config, logger, text, random, math, permissions, errors)
 *
 * Toutes les méthodes d'envoi sont protégées : un échec Facebook (message trop
 * long, thread fermé, débit limité) est journalisé et renvoie `false`, il ne
 * fait jamais planter une commande.
 * ---------------------------------------------------------------------------
 */

const helpers = require("../utils/helpers");
const { chunkMessage, callApiMethod, normalizeUID, sleep } = helpers;

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/** Extrait les mentions Facebook d'un corps de message. */
function extractMentions(body, event) {
  const found = [];
  const text = String(body || "");

  // Format courant : @[100012345678901:0:Nom] ou @[100012345678901]
  const patterns = [/@\[(\d{5,25})(?::\d+)?(?::([^\]]*))?\]/g, /@\{(\d{5,25})\}/g];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(text)) !== null) {
      found.push({ id: match[1], tag: match[2] ? match[2].trim() : "", index: match.index });
    }
  }

  const declared = Array.isArray(event && event.mentions) ? event.mentions : [];
  for (const mention of declared) {
    const id = normalizeUID(mention && (mention.id || mention.userID));
    if (id && !found.some((f) => f.id === id)) {
      found.push({ id, tag: String((mention && mention.tag) || "").trim(), index: Number(mention && mention.index) || 0 });
    }
  }
  return found;
}

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} [deps.logger]
 * @param {object} deps.services  tous les services (users, economy, …)
 * @param {object} deps.registry
 * @param {object} deps.permissions
 * @param {object} [deps.guard]  garde anti-spam/cooldowns (état exposé aux commandes)
 * @param {object} deps.errors
 * @param {object} deps.text
 * @param {object} deps.random
 * @param {object} deps.math
 * @param {() => object|null} deps.getApi
 * @param {() => object|null} deps.getBot
 * @param {() => string} deps.getBotUserID
 */
function createContextBuilder(deps = {}) {
  const { config, services, registry, permissions, errors, text, random, math } = deps;
  /** Garde anti-spam/cooldowns : exposée aux commandes (état réel, /antispam status). */
  const guard = deps.guard || null;
  const logger = deps.logger || noopLogger;
  const getApi = deps.getApi || (() => null);
  const getBot = deps.getBot || (() => null);
  const getBotUserID = deps.getBotUserID || (() => "");

  const maxChunk = Math.max(500, Number((config.limits && config.limits.maxMessageLength) || 4000));

  /** Envoi brut via l'API (jamais d'exception remontée). */
  async function rawSend(payload, threadID) {
    const api = getApi();
    if (!api || typeof api.sendMessage !== "function") {
      logger.warn("Envoi ignoré : API Facebook indisponible.", "context");
      return false;
    }
    try {
      await callApiMethod(api.sendMessage.bind(api), [payload, String(threadID)], { timeoutMs: 25000 });
      return true;
    } catch (err) {
      logger.warn(`Échec d'envoi (${String(err.message).slice(0, 120)})`, "context");
      return false;
    }
  }

  /**
   * Construit le contexte d'un message.
   *
   * @param {object} rawCtx  MessengerContext de la librairie
   * @param {object} meta    { command, args, argString, prefix, isGroup, threadName, groupAdminIDs, participantIDs, settings }
   */
  function build(rawCtx, meta = {}) {
    const event = (rawCtx && rawCtx.event) || {};
    const threadID = String((rawCtx && rawCtx.threadID) || event.threadID || "");
    const senderID = String((rawCtx && rawCtx.senderID) || event.senderID || "");
    const messageID = String((rawCtx && rawCtx.messageID) || event.messageID || "");
    const body = typeof event.body === "string" ? event.body : String((rawCtx && rawCtx.text) || "");
    const api = getApi();
    const bot = getBot();
    const botUserID = getBotUserID();

    const mentions = extractMentions(body, event);
    const attachments = Array.isArray(event.attachments) ? event.attachments : [];
    const replied = event.messageReply || (event.type === "message_reply" ? event : null);

    const senderRecord = services.users ? services.users.peek(senderID) : null;
    const senderName =
      String(event.senderName || "").trim() ||
      (senderRecord && senderRecord.name) ||
      String((event && event.senderFullName) || "").trim() ||
      "";

    /** Envoie du texte (découpé si nécessaire). */
    async function send(payload) {
      if (!threadID) return false;
      if (typeof payload === "string") {
        const chunks = chunkMessage(payload, maxChunk);
        let ok = true;
        for (const chunk of chunks) {
          const sent = await rawSend(chunk, threadID);
          ok = ok && sent;
          if (chunks.length > 1) await sleep(250); // évite le rejet « trop de messages »
        }
        return ok;
      }
      return rawSend(payload, threadID);
    }

    /** Répond au message courant (équivalent à send, sémantique claire). */
    const reply = (payload) => send(payload);

    /** Envoie une image (Buffer) avec une légende optionnelle. */
    async function sendImage(buffer, options = {}) {
      if (!Buffer.isBuffer(buffer) || !buffer.length) return false;
      const payload = { attachment: buffer };
      if (options.caption) payload.body = String(options.caption).slice(0, maxChunk);
      return send(payload);
    }

    /** Envoie un lien (Messenger génère l'aperçu). */
    function sendUrl(url, caption = "") {
      const payload = { url: String(url) };
      if (caption) payload.body = String(caption).slice(0, maxChunk);
      return send(payload);
    }

    /** Envoie un emoji en grand format. */
    function sendEmoji(emoji, size = "large") {
      return send({ emoji: String(emoji || "🔵"), emojiSize: size });
    }

    /** Envoie un autocollant Messenger par son identifiant. */
    function sendSticker(stickerID) {
      if (!stickerID) return false;
      return send({ sticker: stickerID });
    }

    /** Indicateur « en train d'écrire… ». */
    async function typing(durationMs = 1200) {
      if (!api || typeof api.sendTypingIndicator !== "function") return false;
      try {
        const stop = await callApiMethod(api.sendTypingIndicator.bind(api), [threadID], { timeoutMs: 10000 });
        if (durationMs > 0) await sleep(Math.min(5000, durationMs));
        if (typeof stop === "function") stop();
        return true;
      } catch (err) {
        logger.debug(`Indicateur de frappe indisponible : ${err.message}`, "context");
        return false;
      }
    }

    /** Réagit au message courant. */
    async function react(emoji = "🔵") {
      if (!api || typeof api.setPostReaction !== "function" || !messageID) return false;
      try {
        await callApiMethod(api.setPostReaction.bind(api), [emoji, messageID], { timeoutMs: 10000 });
        return true;
      } catch (err) {
        logger.debug(`Réaction impossible : ${err.message}`, "context");
        return false;
      }
    }

    /** Construit un payload qui mentionne des utilisateurs. */
    function mentionPayload(tagByUser, bodyText) {
      const mentionList = Object.entries(tagByUser || {})
        .map(([id, tag], index) => ({ id: normalizeUID(id), tag: String(tag || ""), fromIndex: index * 10 }))
        .filter((m) => m.id);
      return { body: String(bodyText || ""), mentions: mentionList };
    }

    /**
     * Résout la cible d'une commande : argument UID, mention, message cité,
     * sinon l'auteur lui-même.
     *
     * @param {string} [argument]
     * @returns {{ id: string, name: string, source: "uid"|"mention"|"reply"|"self", explicit: boolean }}
     */
    function resolveTarget(argument) {
      const raw = String(argument || "").trim();

      const asUid = normalizeUID(raw.replace(/[^\d]/g, ""));
      if (asUid && asUid === raw) {
        return { id: asUid, name: services.users ? services.users.getName(asUid) : "", source: "uid", explicit: true };
      }

      if (mentions.length) {
        const first = mentions[0];
        return { id: first.id, name: first.tag || (services.users ? services.users.getName(first.id) : ""), source: "mention", explicit: true };
      }

      const repliedSender = normalizeUID(replied && (replied.senderID || (replied.messageReply && replied.messageReply.senderID)));
      if (repliedSender && repliedSender !== botUserID) {
        return { id: repliedSender, name: services.users ? services.users.getName(repliedSender) : "", source: "reply", explicit: true };
      }

      return { id: senderID, name: senderName, source: "self", explicit: false };
    }

    /** Nom lisible d'un utilisateur (profil connu, mention, sinon UID tronqué). */
    function displayName(userID, fallback = "") {
      const id = normalizeUID(userID);
      if (!id) return String(fallback || "").trim() || "quelqu'un";
      const known = services.users ? services.users.getName(id) : "";
      if (known) return known;
      const mention = mentions.find((m) => m.id === id);
      if (mention && mention.tag) return mention.tag;
      return String(fallback || "").trim() || id;
    }

    const ctx = {
      // identifiants
      raw: rawCtx,
      event,
      bot,
      api,
      botUserID,
      threadID,
      senderID,
      messageID,
      body,
      attachments,
      mentions,
      replied,
      // conversation
      isGroup: Boolean(meta.isGroup),
      threadName: String(meta.threadName || ""),
      groupAdminIDs: Array.isArray(meta.groupAdminIDs) ? meta.groupAdminIDs : [],
      participantIDs: Array.isArray(meta.participantIDs) ? meta.participantIDs : [],
      memberCount: Number(meta.memberCount) || 0,
      senderName,
      // commande
      command: meta.command || null,
      args: Array.isArray(meta.args) ? meta.args : [],
      argString: String(meta.argString || ""),
      prefix: String(meta.prefix || config.prefix || "/"),
      settings: meta.settings || null,
      startedAt: meta.startedAt || Date.now(),
      // helpers d'envoi
      send,
      reply,
      sendImage,
      sendUrl,
      sendEmoji,
      sendSticker,
      typing,
      react,
      mentionPayload,
      // helpers de contexte
      resolveTarget,
      displayName,
      /** Renvoie la réponse de la librairie pour compatibilité. */
      replyAsync: (payload) => send(payload)
    };

    const bag = {
      config,
      logger,
      text,
      random,
      math,
      /** Utilitaires partagés (formatDuration, closestMatch, callApiMethod…). */
      helpers,
      services,
      registry,
      permissions,
      guard,
      errors,
      api,
      bot,
      botUserID,
      /** Raccourcis les plus utilisés. */
      users: services.users,
      economy: services.economy,
      xp: services.xp,
      groups: services.groups,
      settings: services.settings,
      warnings: services.warnings,
      stats: services.stats,
      logs: services.logs,
      games: services.games,
      conversation: services.conversation,
      scheduler: services.scheduler,
      external: services.external,
      store: services.store,
      /** Envoie un message à un autre thread (broadcast, notifications). */
      sendTo: (targetThreadID, payload) => rawSend(payload, targetThreadID),
      /** Durée écoulée depuis le début du traitement de la commande. */
      elapsed: () => Date.now() - (ctx.startedAt || Date.now())
    };

    return { ctx, bag };
  }

  return { build, extractMentions, rawSend };
}

module.exports = { createContextBuilder, extractMentions };
