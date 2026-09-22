"use strict";

/**
 * core/registry.js
 * ---------------------------------------------------------------------------
 * Chargement automatique des commandes.
 *
 * Chaque fichier de `commands/<catégorie>/<nom>.js` exporte un descripteur :
 *
 *   module.exports = {
 *     name: "ping",                 // obligatoire, unique, sans préfixe
 *     category: "general",          // optionnel : défaut = nom du dossier
 *     description: "…",             // obligatoire (affiché dans /help)
 *     usage: "/ping",               // optionnel
 *     examples: ["/ping"],          // optionnel
 *     aliases: ["latence"],         // optionnel
 *     permissions: "public",        // public | groupadmin | admin | owner
 *     cooldown: 3,                  // secondes
 *     groupOnly: false,
 *     hidden: false,                // masqué dans /help
 *     typing: true,                 // indicateur de frappe avant réponse
 *     execute(ctx, bag) {}          // obligatoire
 *   };
 *
 * Le registre valide chaque fichier, refuse les doublons et n'interrompt
 * JAMAIS le démarrage : une commande cassée est signalée dans les logs et le
 * reste du bot fonctionne (voir core/errors.js).
 * ---------------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/** Catégories, dans l'ordre d'affichage du menu. */
const CATEGORIES = {
  general: { label: "Général", icon: "🔹", description: "Commandes de base du bot" },
  games: { label: "Jeux", icon: "🎮", description: "Quiz, duels, hasard et XP" },
  economy: { label: "Économie", icon: "💰", description: "IDREM Coins, boutique, revenus" },
  social: { label: "Social", icon: "💞", description: "Interactions entre utilisateurs" },
  utility: { label: "Utilitaires", icon: "🧰", description: "Outils du quotidien" },
  ai: { label: "IA", icon: "🧠", description: "Assistant intelligent (si configuré)" },
  fun: { label: "Fun", icon: "🎭", description: "Divertissement, sans prise au sérieux" },
  media: { label: "Médias", icon: "🎬", description: "Liens, paroles, images" },
  groups: { label: "Groupes", icon: "👥", description: "Gestion de la conversation" },
  config: { label: "Configuration", icon: "⚙️", description: "Réglages par groupe" },
  stats: { label: "Statistiques", icon: "📊", description: "Usage du bot" },
  admin: { label: "Administration", icon: "🛡️", description: "Réservé aux administrateurs" }
};

const CATEGORY_ORDER = [
  "general",
  "games",
  "economy",
  "social",
  "utility",
  "ai",
  "fun",
  "media",
  "groups",
  "config",
  "stats",
  "admin"
];

/** Alias de catégories acceptés dans les fichiers (français compris). */
const CATEGORY_ALIASES = {
  general: "general",
  generale: "general",
  général: "general",
  base: "general",
  jeux: "games",
  game: "games",
  games: "games",
  economie: "economy",
  économie: "economy",
  economy: "economy",
  social: "social",
  societe: "social",
  utilitaire: "utility",
  utilitaires: "utility",
  utility: "utility",
  utils: "utility",
  ia: "ai",
  ai: "ai",
  intelligence: "ai",
  fun: "fun",
  humour: "fun",
  media: "media",
  medias: "media",
  médias: "media",
  groupe: "groups",
  groupes: "groups",
  groups: "groups",
  config: "config",
  configuration: "config",
  settings: "config",
  stats: "stats",
  statistiques: "stats",
  admin: "admin",
  administration: "admin",
  moderation: "admin",
  modération: "admin"
};

function normalizeCategory(value) {
  const key = String(value || "").trim().toLowerCase();
  return CATEGORY_ALIASES[key] || (CATEGORIES[key] ? key : "");
}

const VALID_PERMISSIONS = ["public", "groupadmin", "admin", "owner"];

function normalizePermissions(value) {
  const key = String(value || "public").trim().toLowerCase();
  if (VALID_PERMISSIONS.includes(key)) return key;
  const aliases = {
    utilisateur: "public",
    user: "public",
    tous: "public",
    all: "public",
    group: "groupadmin",
    groupe: "groupadmin",
    groupadmin: "groupadmin",
    administrateur: "admin",
    administrateurs: "admin",
    proprietaire: "owner",
    propriétaire: "owner",
    owneronly: "owner"
  };
  return aliases[key] || "public";
}

/**
 * Valide et normalise un descripteur de commande.
 * @returns {{ ok: boolean, command?: object, error?: string }}
 */
function validateCommand(raw, meta) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "module.exports n'est pas un objet" };
  if (typeof raw.execute !== "function") return { ok: false, error: "fonction execute() manquante" };

  const name = String(raw.name || "").trim().toLowerCase();
  if (!name) return { ok: false, error: "name manquant" };
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) {
    return { ok: false, error: `name invalide (« ${name} ») : lettres minuscules, chiffres, - ou _ uniquement` };
  }

  const category = normalizeCategory(raw.category) || normalizeCategory(meta.folder) || "general";
  const permissions = normalizePermissions(raw.permissions || (raw.ownerOnly ? "owner" : "public"));
  const cooldown = Number(raw.cooldown);

  const aliases = (Array.isArray(raw.aliases) ? raw.aliases : [])
    .map((alias) => String(alias || "").trim().toLowerCase())
    .filter((alias) => /^[a-z0-9][a-z0-9_-]{0,31}$/.test(alias) && alias !== name)
    .slice(0, 8);

  const command = {
    name,
    category,
    description: String(raw.description || "").trim().slice(0, 200) || "Aucune description.",
    usage: String(raw.usage || "").trim() || `${meta.prefixPlaceholder}${name}`,
    examples: Array.isArray(raw.examples) ? raw.examples.map((e) => String(e)).slice(0, 5) : [],
    aliases,
    permissions,
    cooldown: Number.isFinite(cooldown) ? Math.max(0, Math.min(3600, cooldown)) : null, // null = défaut global
    groupOnly: Boolean(raw.groupOnly),
    ownerOnly: permissions === "owner",
    hidden: Boolean(raw.hidden),
    typing: raw.typing === undefined ? true : Boolean(raw.typing),
    external: Boolean(raw.external),
    file: meta.file,
    execute: raw.execute
  };

  return { ok: true, command };
}

/** Liste récursivement les fichiers .js d'un dossier. */
function listCommandFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listCommandFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * Crée le registre de commandes.
 *
 * @param {object} deps
 * @param {string} [deps.dir]      dossier racine des commandes
 * @param {object} [deps.logger]
 * @param {() => string} [deps.getPrefix] préfixe courant (pour l'usage affiché)
 */
function createRegistry(deps = {}) {
  const rootDir = deps.dir || path.resolve(__dirname, "..", "commands");
  const logger = deps.logger || noopLogger;
  const getPrefix = typeof deps.getPrefix === "function" ? deps.getPrefix : () => "/";

  /** @type {Map<string, object>} nom → commande */
  const commands = new Map();
  /** @type {Map<string, string>} alias → nom */
  const aliases = new Map();
  /** @type {Array<{ file: string, error: string }>} */
  const loadErrors = [];

  function register(command) {
    if (commands.has(command.name)) {
      const existing = commands.get(command.name);
      loadErrors.push({ file: command.file, error: `doublon de « ${command.name} » (déjà chargé depuis ${existing.file})` });
      logger.warn(`Commande ignorée : doublon « ${command.name} » (${command.file}).`, "registry");
      return false;
    }
    commands.set(command.name, command);
    for (const alias of command.aliases) {
      if (aliases.has(alias) || commands.has(alias)) {
        loadErrors.push({ file: command.file, error: `alias « ${alias} » déjà utilisé` });
        logger.warn(`Alias ignoré : « ${alias} » déjà pris (${command.file}).`, "registry");
        continue;
      }
      aliases.set(alias, command.name);
    }
    return true;
  }

  /** (Re)charge toutes les commandes depuis le disque. */
  function load(options = {}) {
    if (options.clearCache) {
      for (const file of [...commands.values()].map((c) => c.file)) {
        try {
          delete require.cache[require.resolve(file)];
        } catch {
          /* fichier déjà absent */
        }
      }
    }
    commands.clear();
    aliases.clear();
    loadErrors.length = 0;

    const prefix = getPrefix();
    const files = listCommandFiles(rootDir);

    for (const file of files) {
      const folder = path.basename(path.dirname(file));
      try {
        if (options.clearCache) delete require.cache[require.resolve(file)];
        const mod = require(file);
        const validated = validateCommand(mod.default || mod, {
          file: path.relative(path.resolve(rootDir, ".."), file),
          folder,
          prefixPlaceholder: prefix
        });
        if (!validated.ok) {
          loadErrors.push({ file: path.relative(rootDir, file), error: validated.error });
          logger.warn(`Commande invalide (${path.relative(rootDir, file)}) : ${validated.error}`, "registry");
          continue;
        }
        if (!CATEGORIES[validated.command.category]) {
          logger.warn(`Catégorie inconnue « ${validated.command.category} » pour ${validated.command.name} → general.`, "registry");
          validated.command.category = "general";
        }
        register(validated.command);
      } catch (err) {
        loadErrors.push({ file: path.relative(rootDir, file), error: err.message });
        logger.error(`Chargement impossible de ${path.relative(rootDir, file)} : ${err.message}`, "registry");
      }
    }

    logger.info(`Registre : ${commands.size} commande(s) chargée(s), ${loadErrors.length} problème(s).`, "registry");
    return { loaded: commands.size, errors: loadErrors.length };
  }

  /** Cherche une commande par son nom ou un alias. */
  function resolve(nameOrAlias) {
    const key = String(nameOrAlias || "").trim().toLowerCase();
    if (!key) return null;
    if (commands.has(key)) return commands.get(key);
    const target = aliases.get(key);
    return target ? commands.get(target) || null : null;
  }

  function has(name) {
    return Boolean(resolve(name));
  }

  function get(name) {
    return commands.get(String(name || "").toLowerCase()) || null;
  }

  function list() {
    return [...commands.values()];
  }

  function count() {
    return commands.size;
  }

  /** Commandes visibles d'une catégorie. */
  function byCategory(category) {
    const key = normalizeCategory(category) || String(category || "").toLowerCase();
    return list()
      .filter((c) => c.category === key && !c.hidden)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Toutes les catégories qui contiennent au moins une commande visible. */
  function categories() {
    const counts = new Map();
    for (const command of list()) {
      if (command.hidden) continue;
      counts.set(command.category, (counts.get(command.category) || 0) + 1);
    }
    return CATEGORY_ORDER.filter((key) => counts.has(key)).map((key) => ({
      key,
      ...CATEGORIES[key],
      count: counts.get(key) || 0
    }));
  }

  /** Toutes les commandes visibles, groupées par catégorie. */
  function grouped() {
    const out = {};
    for (const category of categories()) {
      out[category.key] = byCategory(category.key);
    }
    return out;
  }

  /** Commandes utilisables par un niveau de permission donné. */
  function forLevel(level) {
    const order = { public: 0, groupadmin: 1, admin: 2, owner: 3 };
    const max = order[String(level || "public")] ?? 0;
    return list().filter((c) => !c.hidden && (order[c.permissions] ?? 0) <= max);
  }

  /** Noms + alias (pour la suggestion « vouliez-vous dire… ? »). */
  function searchableNames() {
    return [...commands.keys(), ...aliases.keys()];
  }

  function errors() {
    return loadErrors.map((e) => ({ ...e }));
  }

  return {
    CATEGORIES,
    CATEGORY_ORDER,
    load,
    resolve,
    has,
    get,
    list,
    count,
    byCategory,
    categories,
    grouped,
    forLevel,
    searchableNames,
    errors,
    normalizeCategory,
    normalizePermissions,
    commands
  };
}

module.exports = { createRegistry, CATEGORIES, CATEGORY_ORDER, normalizeCategory, normalizePermissions, validateCommand };
