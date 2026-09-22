"use strict";

/**
 * services/conversation.js
 * ---------------------------------------------------------------------------
 * Système de conversation naturelle.
 *
 * Le bot ne doit PAS être une machine à commandes muette : il salue, remercie,
 * répond aux questions simples et réagit quand on le mentionne. Mais il ne doit
 * surtout PAS spammer. Quatre garde-fous :
 *
 *   1. PROBABILITÉ   — en privé `conversation.probability`, en groupe
 *                      `conversation.groupProbability` (plus discret).
 *   2. COOLDOWNS     — par conversation ET par utilisateur.
 *   3. ANTI-BOUCLE   — jamais deux réponses identiques à la suite, jamais de
 *                      réponse à ses propres messages, recul progressif si le
 *                      bot a déjà beaucoup parlé dans la conversation.
 *   4. INTENTION     — on ne répond que si le message a du sens (salutation,
 *                      remerciement, question sur le bot…). Sinon silence.
 * ---------------------------------------------------------------------------
 */

const { pick, randInt, chance } = require("../utils/random");
const corpus = require("./corpus");

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/** Expressions déclencheuses par intention (accent-insensibles). */
const INTENT_PATTERNS = [
  {
    intent: "whoareyou",
    re: /\b(qui\s*(es|est)\s*-?\s*t(u|oi)|t(u|oi)\s*es\s*qui|c'est\s*qui\s*toi|tu\s*t'appelles\s*comment|ton\s*(nom|prénom|prenom)|who\s*are\s*you|what\s*is\s*your\s*name|t\s*qui)\b/i,
    priority: 10
  },
  {
    intent: "help",
    re: /\b(aide[\s-]?moi|tu\s*peux\s*m'aider|peux[\s-]?tu\s*m'aider|j'ai\s*besoin\s*d'aide|help\s*me|comment\s*(on\s*)?fait|je\s*fais\s*comment|how\s*(do|to)\s*i)\b/i,
    priority: 9
  },
  {
    intent: "howareyou",
    re: /\b(ça\s*va|ca\s*va|comment\s*(ça|ca)\s*va|tu\s*vas\s*bien|la\s*forme|quoi\s*de\s*neuf|how\s*are\s*you|how('s| is) it going|cv\s*\??|ça\s*vient)\b/i,
    priority: 8
  },
  {
    intent: "thanks",
    re: /\b(merci|mrc|thanks|thank\s*you|thx|ty|bien\s*joué|bravo)\b/i,
    priority: 7
  },
  {
    intent: "goodbye",
    re: /\b(au\s*revoir|à\s*bientôt|a\s*bientot|bonne\s*(nuit|soirée|soiree|journée|journee)|bye|ciao|à\s*plus|a\s*plus|adieu|good\s*night)\b/i,
    priority: 6
  },
  {
    intent: "laugh",
    re: /\b(mdr|ptdr|mdrr+|lol|lmao|haha+|hihi+|xd|mort\s*de\s*rire)\b|😂|🤣/i,
    priority: 5
  },
  {
    intent: "insult",
    re: /\b(tg|ta\s*gueule|ferme[\s-]?la|idiot(e)?|stupide|débile|debile|nul(le)?|bot\s*(de\s*merde|inutile|clown)|t'es\s*chiant|fuck\s*(you|off)|connard|connasse|imbécile|imbecile)\b/i,
    priority: 6
  },
  {
    intent: "greeting",
    re: /\b(bonjour|bonsoir|salut|hello|hi|hey|yo|coucou|cc|slt|bjr|wsh|salam|allo|allô|good\s*(morning|evening)|hey\s*there)\b/i,
    priority: 4
  }
];

/** Retire les accents pour comparer sans fausse négative. */
function fold(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} [deps.logger]
 * @param {object} [deps.stats]    pour compter les réponses automatiques
 * @param {object} [deps.registry] pour connaître le nombre de commandes
 */
function createConversation(deps = {}) {
  const { config } = deps;
  const logger = deps.logger || noopLogger;
  const stats = deps.stats || null;
  const registry = deps.registry || null;

  /** @type {Map<string, number>} threadID → prochain droit de réponse */
  const threadCooldown = new Map();
  /** @type {Map<string, number>} userID → prochain droit de réponse */
  const userCooldown = new Map();
  /** @type {Map<string, string>} threadID → dernière intention répondue */
  const lastIntent = new Map();
  /** @type {Map<string, { count: number, resetAt: number }>} threadID → pression de conversation */
  const pressure = new Map();

  const MAX_AUTO_PER_WINDOW = 6; // réponses automatiques par fenêtre glissante
  const PRESSURE_WINDOW_MS = 10 * 60 * 1000;

  function sweep(now) {
    for (const [key, expiry] of threadCooldown) if (expiry <= now) threadCooldown.delete(key);
    for (const [key, expiry] of userCooldown) if (expiry <= now) userCooldown.delete(key);
    for (const [key, entry] of pressure) if (entry.resetAt <= now) pressure.delete(key);
  }

  /** Noms et alias permettant de détecter une mention du bot. */
  function botNames() {
    const identity = config.identity || {};
    const names = new Set();
    const full = String(identity.name || "").toLowerCase();
    const short = String(identity.short || "").toLowerCase();
    if (full) names.add(fold(full));
    if (short) names.add(fold(short));
    for (const alias of Array.isArray(identity.mentionAliases) ? identity.mentionAliases : []) {
      const clean = fold(String(alias).toLowerCase());
      if (clean) names.add(clean);
    }
    return [...names];
  }

  /**
   * Le message mentionne-t-il le bot (@Idrem, "IDREM aide-moi", nom complet) ?
   *
   * @param {string} text
   * @param {{ mentionedUserIDs?: string[], botUserID?: string, mentions?: string[] }} [context]
   */
  function isMention(text, context = {}) {
    const body = fold(text);
    const botUserID = String(context.botUserID || "").trim();

    // 1. Mention Facebook réelle (@[pid:...] ou @[UID:name]).
    const mentioned = Array.isArray(context.mentionedUserIDs) ? context.mentionedUserIDs.map(String) : [];
    if (botUserID && mentioned.includes(botUserID)) return true;

    const raw = String(context.raw || text || "");
    const mentionPatterns = [/@\[[^\]]*\]/g, /@\{[^}]*\}/g];
    for (const re of mentionPatterns) {
      const matches = raw.match(re);
      if (matches && botUserID && matches.some((m) => m.includes(botUserID))) return true;
    }

    // 2. Nom du bot écrit en clair.
    if (!body) return false;
    for (const name of botNames()) {
      if (name.length < 3) continue;
      if (new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(body)) {
        return true;
      }
    }
    return false;
  }

  /** Pression de conversation : refroidit le bot s'il a déjà beaucoup parlé. */
  function pressureFactor(threadID) {
    const now = Date.now();
    sweep(now);
    const entry = pressure.get(threadID) || { count: 0, resetAt: now + PRESSURE_WINDOW_MS };
    if (entry.resetAt <= now) {
      entry.count = 0;
      entry.resetAt = now + PRESSURE_WINDOW_MS;
    }
    pressure.set(threadID, entry);
    return entry.count;
  }

  function noteReply(threadID, intent) {
    const now = Date.now();
    const entry = pressure.get(threadID) || { count: 0, resetAt: now + PRESSURE_WINDOW_MS };
    entry.count += 1;
    pressure.set(threadID, entry);
    if (intent) lastIntent.set(threadID, intent);
    if (stats && typeof stats.recordConversation === "function") stats.recordConversation();
  }

  /**
   * Le bot a-t-il le droit de répondre à ce message ?
   *
   * @param {object} params
   * @param {string} params.threadID
   * @param {string} params.senderID
   * @param {string} params.text
   * @param {boolean} [params.isGroup]
   * @param {boolean} [params.isSelf]     message du bot lui-même
   * @param {boolean} [params.isCommand]  message traité comme commande
   * @param {boolean} [params.mention]    mention du bot détectée
   * @returns {{ reply: boolean, reason?: string }}
   */
  function canReply(params = {}) {
    const conversation = config.conversation || {};
    if (!conversation.enabled) return { reply: false, reason: "conversation désactivée" };
    if (params.isSelf) return { reply: false, reason: "message du bot" };
    if (params.isCommand) return { reply: false, reason: "commande" };
    if (params.isBanned) return { reply: false, reason: "utilisateur banni" };

    const text = String(params.text || "").trim();
    const minLength = Math.max(1, Number(conversation.minTextLength) || 2);
    if (text.length < minLength) return { reply: false, reason: "trop court" };

    const now = Date.now();
    sweep(now);

    const threadKey = String(params.threadID || "");
    const userKey = String(params.senderID || "");

    // Une mention force toujours la réponse (si activé).
    const forcedByMention = Boolean(params.mention) && conversation.mentionAlwaysReplies !== false;

    if (!forcedByMention) {
      if (threadKey && (threadCooldown.get(threadKey) || 0) > now) {
        return { reply: false, reason: "cooldown conversation" };
      }
      if (userKey && (userCooldown.get(userKey) || 0) > now) {
        return { reply: false, reason: "cooldown utilisateur" };
      }

      const probability = params.isGroup
        ? Number(conversation.groupProbability) || 0
        : Number(conversation.probability) || 0;

      // Recul progressif : moins le bot a parlé, plus il est bavard.
      const spoken = pressureFactor(threadKey);
      const damping = spoken >= MAX_AUTO_PER_WINDOW ? 0 : Math.max(0.15, 1 - spoken / (MAX_AUTO_PER_WINDOW + 2));
      if (!chance(probability * damping)) return { reply: false, reason: "probabilité" };
    }

    return { reply: true, mention: forcedByMention };
  }

  /** Applique les cooldowns après une réponse. */
  function markReplied(threadID, senderID) {
    const conversation = config.conversation || {};
    const now = Date.now();
    if (threadID) {
      threadCooldown.set(String(threadID), now + Math.max(0, Number(conversation.threadCooldownMs) || 45000));
      noteReply(String(threadID), null);
    }
    if (senderID) {
      userCooldown.set(String(senderID), now + Math.max(0, Number(conversation.userCooldownMs) || 90000));
    }
  }

  /** Détecte l'intention dominante d'un message. */
  function classify(text) {
    const body = String(text || "").trim();
    if (!body) return null;
    const folded = fold(body);

    let best = null;
    for (const pattern of INTENT_PATTERNS) {
      if (pattern.re.test(folded)) {
        if (!best || pattern.priority > best.priority) best = pattern;
      }
    }

    // Question ouverte sans intention claire → petite discussion.
    if (!best && /\?\s*$/.test(body) && body.length > 6) return { intent: "question", score: 0.4 };
    if (best) return { intent: best.intent, score: 1 };
    return null;
  }

  /** Remplace {name}, {prefix}, {commands} dans une réponse. */
  function fill(template, context = {}) {
    return String(template)
      .replace(/\{name\}/g, context.userName ? String(context.userName).split(" ")[0] : "")
      .replace(/\{prefix\}/g, String(context.prefix || config.prefix || "/"))
      .replace(/\{commands\}/g, String(context.commandCount ?? (registry ? registry.count() : "")) || "plusieurs")
      .replace(/\{bot\}/g, String(config.identity.short || "IDREM"));
  }

  /** Choisit une variante en évitant la répétition immédiate. */
  function pickVariant(list, threadID, intent) {
    if (!Array.isArray(list) || !list.length) return null;
    if (list.length === 1) return list[0];
    const lastKey = `${threadID}:${intent}`;
    const lastIndex = variantMemory.get(lastKey);
    let index = randInt(0, list.length - 1);
    if (index === lastIndex) index = (index + 1) % list.length;
    variantMemory.set(lastKey, index);
    if (variantMemory.size > 400) {
      // Purge légère : on ne garde que les 200 dernières clés.
      const keys = [...variantMemory.keys()].slice(-200);
      variantMemory.clear();
      for (const key of keys) variantMemory.set(key, variantMemory.get(key) ?? 0);
    }
    return list[index];
  }

  /** @type {Map<string, number>} */
  const variantMemory = new Map();

  /**
   * Construit la réponse naturelle à un message.
   *
   * @param {object} params
   * @param {string} params.text
   * @param {string} params.threadID
   * @param {string} [params.userName]
   * @param {boolean} [params.isGroup]
   * @param {boolean} [params.mention]
   * @returns {string|null}
   */
  function respond(params = {}) {
    const threadID = String(params.threadID || "");
    const userName = String(params.userName || "");
    const context = { userName, prefix: config.prefix || "/", commandCount: registry ? registry.count() : null };
    const body = String(params.text || "").trim();

    // 1. Mention du bot → réponse quasi systématique.
    if (params.mention) {
      const intent = classify(body);
      let template;
      if (intent && intent.intent === "whoareyou") template = pickVariant(corpus.WHO_ARE_YOU, threadID, "mention-who");
      else if (intent && intent.intent === "help") template = pickVariant(corpus.HELP_REQUESTS, threadID, "mention-help");
      else if (intent && intent.intent === "thanks") template = pickVariant(corpus.THANKS, threadID, "mention-thanks");
      else if (intent && intent.intent === "howareyou") template = pickVariant(corpus.HOW_ARE_YOU, threadID, "mention-how");
      else template = pickVariant(corpus.MENTIONS, threadID, "mention");
      if (stats && typeof stats.recordMention === "function") stats.recordMention();
      markReplied(threadID, params.senderID);
      return template ? fill(template, context) : null;
    }

    // 2. Intention détectée.
    const detected = classify(body);
    if (!detected) return null;

    let list = null;
    let key = detected.intent;
    switch (detected.intent) {
      case "greeting": list = corpus.GREETINGS; break;
      case "thanks": list = corpus.THANKS; break;
      case "howareyou": list = corpus.HOW_ARE_YOU; break;
      case "whoareyou": list = corpus.WHO_ARE_YOU; break;
      case "help": list = corpus.HELP_REQUESTS; break;
      case "goodbye": list = corpus.GOODBYE; break;
      case "laugh": list = corpus.LAUGHTER; break;
      case "insult": list = corpus.CALM_DOWN; break;
      case "question": list = corpus.SMALL_TALK; break;
      default: list = null;
    }
    if (!list) return null;

    // Anti-boucle : même intention répondue deux fois de suite → on se tait.
    if (lastIntent.get(threadID) === key) {
      logger.debug(`Conversation : intention « ${key} » déjà traitée, silence.`, "conversation");
      return null;
    }

    const template = pickVariant(list, threadID, key);
    if (!template) return null;
    lastIntent.set(threadID, key);
    markReplied(threadID, params.senderID);
    return fill(template, context);
  }

  /** Réponse à une mention explicite (utilisée par le dispatcher). */
  function mentionResponse(params = {}) {
    return respond({ ...params, mention: true });
  }

  /** Réinitialise tous les états (après /reload). */
  function reset() {
    threadCooldown.clear();
    userCooldown.clear();
    lastIntent.clear();
    pressure.clear();
    variantMemory.clear();
  }

  /** État interne pour le diagnostic (/stats). */
  function state() {
    sweep(Date.now());
    return {
      threadsTracked: threadCooldown.size,
      usersTracked: userCooldown.size,
      pressureTracked: pressure.size,
      botNames: botNames()
    };
  }

  return {
    canReply,
    classify,
    respond,
    mentionResponse,
    isMention,
    markReplied,
    botNames,
    reset,
    state,
    fill,
    INTENT_PATTERNS
  };
}

module.exports = { createConversation, INTENT_PATTERNS };
