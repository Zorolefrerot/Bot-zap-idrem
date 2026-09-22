"use strict";

/**
 * services/settings.js
 * ---------------------------------------------------------------------------
 * Réglages PAR CONVERSATION (data/settings.json).
 *
 * Chaque groupe (et chaque discussion privée) possède sa propre configuration :
 * préfixe, messages de bienvenue/départ, antilink, antispam, langue,
 * notifications, jeux, règles, conversation naturelle.
 *
 * Les valeurs non définies héritent des réglages globaux (config.json), ce qui
 * garantit un comportement cohérent dès l'arrivée du bot dans un groupe.
 * ---------------------------------------------------------------------------
 */

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

const PLACEHOLDER_HELP = "{user} {name} {group} {count}";

/** Description des réglages modifiables (utilisée par /settings et /config). */
const SCHEMA = {
  prefix: {
    type: "string",
    label: "Préfixe",
    icon: "🔤",
    max: 4,
    description: "Préfixe des commandes pour ce groupe (vide = préfixe global)."
  },
  welcome: { type: "boolean", label: "Bienvenue", icon: "👋", description: "Message à l'arrivée d'un membre." },
  goodbye: { type: "boolean", label: "Au revoir", icon: "🚪", description: "Message au départ d'un membre." },
  welcomeMsg: { type: "string", label: "Message de bienvenue", icon: "📝", max: 400, description: `Modèle (${PLACEHOLDER_HELP}).` },
  goodbyeMsg: { type: "string", label: "Message de départ", icon: "📝", max: 400, description: `Modèle (${PLACEHOLDER_HELP}).` },
  antilink: { type: "boolean", label: "Anti-lien", icon: "🔗", description: "Supprime les liens non autorisés." },
  antispam: { type: "boolean", label: "Anti-spam", icon: "🛡️", description: "Détecte et limite le flood." },
  language: { type: "enum", label: "Langue", icon: "🌍", values: ["fr", "en"], description: "Langue des réponses du bot." },
  notifications: { type: "boolean", label: "Notifications", icon: "🔔", description: "Annonces de niveaux et d'événements." },
  games: { type: "boolean", label: "Jeux", icon: "🎮", description: "Autorise les jeux dans ce groupe." },
  conversation: { type: "boolean", label: "Conversation", icon: "💬", description: "Réponses naturelles hors commande." },
  rules: { type: "string", label: "Règles", icon: "📜", max: 1200, description: "Texte affiché par /rules." },
  allowedLinkDomains: {
    type: "array",
    label: "Domaines autorisés",
    icon: "🔗",
    max: 30,
    description: "Domaines exemptés de l'anti-lien pour ce groupe."
  }
};

/** Nom d'hôte valide pour la liste blanche anti-lien. */
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

const TRUE_WORDS = ["1", "on", "oui", "true", "yes", "activer", "active", "enabled", "vrai"];
const FALSE_WORDS = ["0", "off", "non", "false", "no", "desactiver", "désactiver", "disable", "disabled", "faux"];

/** Clé du registre GLOBAL (préfixe par défaut, mode du bot) — pas une conversation. */
const GLOBAL_KEY = "global";

/** Modes acceptés par /setstatus. */
const STATUS_MODES = ["actif", "maintenance", "silencieux"];

const STATUS_LABELS = {
  actif: "Opérationnel",
  maintenance: "Maintenance (admins uniquement)",
  silencieux: "Silencieux (commandes uniquement, aucune conversation)"
};

const STATUS_ICONS = { actif: "🟢", maintenance: "🟠", silencieux: "🔕" };

function tid(value) {
  const str = String(value ?? "").trim();
  return /^\d{5,25}$/.test(str) ? str : "";
}

/**
 * @param {object} deps
 * @param {object} deps.store
 * @param {object} deps.config
 * @param {object} [deps.logger]
 */
function createSettings(deps = {}) {
  const { store, config } = deps;
  const logger = deps.logger || noopLogger;
  const collection = store.get("settings", {});

  /** Réglages par défaut, dérivés de config.json (moderation + conversation). */
  function defaults() {
    return {
      prefix: "",
      welcome: Boolean(config.moderation.welcomeDefault),
      goodbye: Boolean(config.moderation.goodbyeDefault),
      welcomeMsg: "👋 Bienvenue {name} dans {group} ! Installe-toi, fais /menu pour découvrir le bot.",
      goodbyeMsg: "🚪 {name} a quitté {group}. Merci pour les souvenirs !",
      antilink: Boolean(config.moderation.antilinkDefault),
      antispam: Boolean(config.moderation.antispamDefault),
      language: String(config.language || "fr"),
      notifications: true,
      games: true,
      conversation: Boolean(config.conversation.enabled),
      allowedLinkDomains: [...(Array.isArray(config.moderation.allowedLinkDomains) ? config.moderation.allowedLinkDomains : [])],
      rules: "📜 Règles du groupe\n\n1. Respect avant tout : aucune insulte, aucun harcèlement.\n2. Pas de spam ni de publicité hors sujet.\n3. Les liens suspects sont interdits (antilink).\n4. Les administrateurs ont le dernier mot.\n\n⚡ Bot : IDREM TERESHKOVA — /menu pour les commandes."
    };
  }

  function repair(record, threadID) {
    const base = defaults();
    if (!record || typeof record !== "object" || Array.isArray(record)) return base;
    const merged = { ...base };
    for (const key of Object.keys(base)) {
      if (!(key in record)) continue;
      const schema = SCHEMA[key];
      const value = record[key];
      if (schema && schema.type === "boolean") merged[key] = Boolean(value);
      else if (schema && schema.type === "enum") merged[key] = schema.values.includes(value) ? value : base[key];
      else if (schema && schema.type === "string") merged[key] = String(value ?? "").slice(0, schema.max || 400);
      else if (schema && schema.type === "array") {
        merged[key] = Array.isArray(value)
          ? [...new Set(value.map((v) => String(v ?? "").trim().toLowerCase()).filter((v) => HOST_RE.test(v)))].slice(0, schema.max || 30)
          : base[key];
      } else merged[key] = value;
    }
    merged.__threadID = threadID;
    return merged;
  }

  /** Réglages effectifs d'une conversation (héritage inclus). */
  function get(threadID) {
    const id = tid(threadID);
    const base = defaults();
    if (!id) return base;
    const stored = collection.data[id];
    if (!stored) return base;
    const merged = repair(stored, id);
    delete merged.__threadID;
    return merged;
  }

  /**
   * Préfixe EFFECTIF d'une conversation.
   * Ordre : réglage du groupe → préfixe global modifié par /setprefix global →
   * préfixe de config.json / variable PREFIX.
   */
  function prefixFor(threadID) {
    const local = String(get(threadID).prefix || "").trim();
    if (local) return local;
    const override = String((collection.data[GLOBAL_KEY] || {}).prefix || "").trim();
    return override || String(config.prefix || "/");
  }

  /** Réglages globaux persistés (dans data/settings.json, clé « global »). */
  function globalOverrides() {
    const raw = collection.data[GLOBAL_KEY];
    if (!raw || typeof raw !== "object") return { prefix: "", status: "actif", statusText: "", updatedAt: null };
    return {
      prefix: String(raw.prefix || "").trim(),
      status: STATUS_MODES.includes(String(raw.status)) ? String(raw.status) : "actif",
      statusText: String(raw.statusText || "").slice(0, 200),
      updatedAt: Number(raw.updatedAt) || null
    };
  }

  /**
   * Change le préfixe GLOBAL du bot (persisté, survit au redémarrage).
   * @param {string} value 1 à 4 caractères, sans espace ; "" = retour à config.prefix
   */
  function setGlobalPrefix(value, meta = {}) {
    const parsed = String(value ?? "").replace(/\s+/g, "").trim();
    if (parsed.length > 4) return { ok: false, error: "Le préfixe est limité à 4 caractères." };
    if (!parsed) {
      const record = collection.data[GLOBAL_KEY] || {};
      delete record.prefix;
      collection.data[GLOBAL_KEY] = { ...record, updatedAt: Date.now() };
      collection.save();
      logger.info(`Préfixe global réinitialisé sur « ${config.prefix} » par ${meta.by || "inconnu"}.`, "settings");
      return { ok: true, prefix: String(config.prefix || "/"), reset: true };
    }
    collection.data[GLOBAL_KEY] = { ...(collection.data[GLOBAL_KEY] || {}), prefix: parsed, updatedAt: Date.now() };
    collection.save();
    logger.info(`Préfixe global = « ${parsed} » par ${meta.by || "inconnu"}.`, "settings");
    return { ok: true, prefix: parsed };
  }

  /** État courant du bot (mode + annonce éventuelle). */
  function status() {
    const g = globalOverrides();
    return {
      mode: g.status,
      label: STATUS_LABELS[g.status] || STATUS_LABELS.actif,
      icon: STATUS_ICONS[g.status] || STATUS_ICONS.actif,
      text: g.statusText,
      updatedAt: g.updatedAt,
      modes: [...STATUS_MODES]
    };
  }

  /**
   * Change le mode du bot.
   * @param {"actif"|"maintenance"|"silencieux"} mode
   * @param {{ text?: string, by?: string }} [meta]
   */
  function setStatus(mode, meta = {}) {
    const parsed = String(mode ?? "").trim().toLowerCase();
    if (!STATUS_MODES.includes(parsed)) {
      return { ok: false, error: `Modes acceptés : ${STATUS_MODES.join(" / ")}.` };
    }
    const text = String(meta.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    collection.data[GLOBAL_KEY] = {
      ...(collection.data[GLOBAL_KEY] || {}),
      status: parsed,
      statusText: text,
      updatedAt: Date.now()
    };
    collection.save();
    logger.info(`Mode du bot = « ${parsed} »${text ? ` (${text})` : ""} par ${meta.by || "inconnu"}.`, "settings");
    return { ok: true, ...status() };
  }

  /** Écrit un réglage en base (ne crée l'entrée que si nécessaire). */
  function set(threadID, key, value, meta = {}) {
    const id = tid(threadID);
    if (!id) return { ok: false, error: "Conversation invalide." };
    const schema = SCHEMA[key];
    if (!schema) return { ok: false, error: `Réglage inconnu : « ${key} ».` };

    let parsed;
    if (schema.type === "boolean") {
      if (typeof value === "boolean") parsed = value;
      else {
        const word = String(value ?? "").trim().toLowerCase();
        if (TRUE_WORDS.includes(word)) parsed = true;
        else if (FALSE_WORDS.includes(word)) parsed = false;
        else if (word === "") parsed = !Boolean(get(id)[key]); // bascule
        else return { ok: false, error: `Valeur attendue : on / off.` };
      }
    } else if (schema.type === "enum") {
      parsed = String(value ?? "").trim().toLowerCase();
      if (!schema.values.includes(parsed)) {
        return { ok: false, error: `Valeurs acceptées : ${schema.values.join(" / ")}.` };
      }
    } else if (schema.type === "array") {
      const list = Array.isArray(value) ? value : String(value ?? "").split(/[\s,;]+/);
      const cleaned = [...new Set(list.map((v) => String(v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]).filter(Boolean))];
      const invalid = cleaned.filter((v) => !HOST_RE.test(v));
      if (invalid.length) return { ok: false, error: `Domaine invalide : « ${invalid[0]} ». Format attendu : exemple.com` };
      if (cleaned.length > (schema.max || 30)) return { ok: false, error: `Trop de domaines (maximum ${schema.max || 30}).` };
      parsed = cleaned;
    } else if (schema.type === "string") {
      parsed = String(value ?? "").replace(/\s+/g, " ").trim();
      if (parsed.length > (schema.max || 400)) {
        return { ok: false, error: `Trop long (max ${schema.max || 400} caractères).` };
      }
      if (key === "prefix") {
        if (parsed && /\s/.test(parsed)) return { ok: false, error: "Le préfixe ne peut pas contenir d'espace." };
        if (parsed.length > 4) return { ok: false, error: "Le préfixe est limité à 4 caractères." };
      }
    } else {
      parsed = value;
    }

    const current = collection.data[id] || {};
    current[key] = parsed;
    collection.data[id] = repair(current, id);
    delete collection.data[id].__threadID;
    collection.save();

    logger.info(`Réglage ${key} = ${JSON.stringify(parsed)} (thread ${id}) par ${meta.by || "inconnu"}.`, "settings");
    return { ok: true, key, value: parsed };
  }

  /** Réinitialise tous les réglages d'une conversation. */
  function reset(threadID) {
    const id = tid(threadID);
    if (!id || !(id in collection.data)) return false;
    delete collection.data[id];
    collection.save();
    return true;
  }

  /** Remplace les modèles de messages par défaut. */
  function render(template, context = {}) {
    const text = String(template ?? "");
    return text
      .replace(/\{user\}/gi, String(context.userTag || context.userName || ""))
      .replace(/\{name\}/gi, String(context.userName || ""))
      .replace(/\{group\}/gi, String(context.threadName || "ce groupe"))
      .replace(/\{count\}/gi, String(context.memberCount ?? ""))
      .replace(/\{bot\}/gi, String(config.identity.short || "IDREM"));
  }

  /** Descripteurs pour l'affichage. */
  function schema() {
    return { ...SCHEMA };
  }

  function keys() {
    return Object.keys(SCHEMA);
  }

  /** Nombre de conversations ayant des réglages personnalisés (clé globale exclue). */
  function count() {
    return Object.keys(collection.data).filter((key) => key !== GLOBAL_KEY).length;
  }

  return {
    SCHEMA,
    STATUS_MODES,
    STATUS_LABELS,
    STATUS_ICONS,
    GLOBAL_KEY,
    defaults,
    get,
    set,
    reset,
    prefixFor,
    globalOverrides,
    setGlobalPrefix,
    status,
    setStatus,
    render,
    schema,
    keys,
    count,
    store: collection
  };
}

module.exports = { createSettings, SCHEMA, GLOBAL_KEY, STATUS_MODES };
