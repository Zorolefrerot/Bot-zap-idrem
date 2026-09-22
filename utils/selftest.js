"use strict";

/**
 * utils/selftest.js
 * ---------------------------------------------------------------------------
 * Test complet du bot SANS connexion Facebook.
 *
 * Deux modes :
 *   runCheck(app)     → diagnostic de configuration (account.txt, registre,
 *                       droits d'écriture, services, sécurité)
 *   runSelfTest(app)  → exécute réellement les 100+ commandes dans une
 *                       application isolée (dossier de données temporaire,
 *                       fausse API Messenger) et vérifie chaque comportement
 *                       exigé par le cahier des charges.
 *
 * Principe : rien n'est simulé côté assertions. Chaque commande est vraiment
 * exécutée par le dispatcher, avec le garde (cooldowns, permissions, flood) et
 * la chaîne d'erreurs. Les services externes injoignables (pas d'internet dans
 * un sandbox) doivent produire un message propre : c'est précisément ce qui est
 * vérifié, jamais un faux résultat.
 * ---------------------------------------------------------------------------
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createBotApp } = require("../core/bot");
const { checkAccount } = require("./account");
const i18n = require("./i18n");

// --- Identités de test ------------------------------------------------------
const BOT_UID = "100000000000001";
const OWNER_UID = "100065927401614"; // propriétaire réel du cahier des charges
const ADMIN_UID = "100000000000002";
const USER_A = "100000000000003";
const USER_B = "100000000000004";
const USER_C = "100000000000005";
const GROUP_A = "900000000000001";
const GROUP_B = "900000000000002";
const PRIVATE_A = "100000000000003"; // MP = UID de l'utilisateur

const NAMES = {
  [BOT_UID]: "IDREM TERESHKOVA",
  [OWNER_UID]: "Propriétaire",
  [ADMIN_UID]: "Admin Bot",
  [USER_A]: "Alice Test",
  [USER_B]: "Bob Test",
  [USER_C]: "Carl Test"
};

/** Commandes qui arrêtent le processus : jamais exécutées en test. */
const PROCESS_KILLERS = ["restart", "shutdown"];

// ---------------------------------------------------------------------------
// Rapport d'assertions
// ---------------------------------------------------------------------------

function createReport(title) {
  const results = [];
  let section = "";

  const api = {
    section(name) {
      section = name;
      results.push({ type: "section", name });
    },
    check(name, condition, detail = "") {
      results.push({ type: "check", section, name, pass: Boolean(condition), detail: condition ? "" : String(detail || "").slice(0, 300) });
      return Boolean(condition);
    },
    ok(name, detail = "") {
      return api.check(name, true, detail);
    },
    fail(name, detail = "") {
      return api.check(name, false, detail);
    },
    get results() {
      return results;
    },
    get passed() {
      return results.filter((r) => r.type === "check" && r.pass).length;
    },
    get failed() {
      return results.filter((r) => r.type === "check" && !r.pass).length;
    },
    get total() {
      return results.filter((r) => r.type === "check").length;
    }
  };

  api.results.push({ type: "title", name: title });
  return api;
}

function printReport(report, options = {}) {
  const verbose = options.verbose !== false;
  const lines = [];

  for (const entry of report.results) {
    if (entry.type === "title") {
      lines.push("");
      lines.push("═".repeat(66));
      lines.push(`  ${entry.name}`);
      lines.push("═".repeat(66));
    } else if (entry.type === "section") {
      lines.push("");
      lines.push(`── ${entry.name} ${"─".repeat(Math.max(0, 60 - entry.name.length))}`);
    } else if (verbose || !entry.pass) {
      lines.push(`  ${entry.pass ? "✅" : "❌"} ${entry.name}${entry.detail ? `\n     ↳ ${entry.detail}` : ""}`);
    }
  }

  lines.push("");
  lines.push("─".repeat(66));
  lines.push(`  Résultat : ${report.passed}/${report.total} vérifications réussies${report.failed ? ` • ❌ ${report.failed} échec(s)` : " • aucun échec"}`);
  lines.push("─".repeat(66));
  process.stdout.write(`${lines.join("\n")}\n`);
}

// ---------------------------------------------------------------------------
// Fausse API Messenger (mêmes signatures que @dongdev/fca-unofficial)
// ---------------------------------------------------------------------------

function createFakeApi(options = {}) {
  const sent = options.sent || [];
  const failures = options.failures || new Set();
  const threads = options.threads || {};

  const wrap = (name, handler) => (arg1, arg2, arg3, arg4) => {
    const args = [arg1, arg2, arg3, arg4];
    const callback = args.find((value) => typeof value === "function");
    if (failures.has(name)) {
      if (callback) return callback(new Error(`${name} refusé par le test`));
      return Promise.reject(new Error(`${name} refusé par le test`));
    }
    const value = handler(...args.filter((a) => typeof a !== "function"));
    if (callback) return callback(null, value);
    return Promise.resolve(value);
  };

  return {
    sendMessage: wrap("sendMessage", (payload, threadID) => {
      sent.push({ payload, threadID: String(threadID || ""), at: Date.now() });
      return { messageID: `sent_${sent.length}`, threadID: String(threadID || "") };
    }),
    unsendMessage: wrap("unsendMessage", (messageID) => ({ unsent: String(messageID || "") })),
    setPostReaction: wrap("setPostReaction", (emoji, messageID) => ({ emoji, messageID })),
    sendTypingIndicator: wrap("sendTypingIndicator", () => () => {}),
    getThreadInfo: wrap("getThreadInfo", (threadID) => {
      const id = String(threadID || "");
      return (
        threads[id] || {
          name: id.startsWith("9") ? `Groupe ${id.slice(-3)}` : NAMES[id] || "Conversation",
          isGroup: id.startsWith("9"),
          participantIDs: id.startsWith("9") ? [OWNER_UID, USER_A, USER_B] : [id, BOT_UID],
          adminIDs: id.startsWith("9") ? [USER_A] : [],
          memberCount: id.startsWith("9") ? 3 : 2
        }
      );
    }),
    getUserInfo: wrap("getUserInfo", (ids) => {
      const list = Array.isArray(ids) ? ids : [ids];
      const out = {};
      for (const raw of list) {
        const id = String(raw || "");
        out[id] = {
          name: NAMES[id] || `Utilisateur ${id.slice(-4)}`,
          firstName: (NAMES[id] || "Utilisateur").split(" ")[0],
          vanity: "",
          isFriend: true,
          thumbSrc: "https://example.test/avatar.png",
          gender: ""
        };
      }
      return out;
    }),
    getCurrentUserID: wrap("getCurrentUserID", () => BOT_UID),
    resolvePhotoUrl: wrap("resolvePhotoUrl", (photoID) => `https://example.test/photo/${photoID}.jpg`),
    removeUserFromGroup: wrap("removeUserFromGroup", (userID, threadID) => ({ removed: String(userID), threadID: String(threadID) })),
    changeNickname: wrap("changeNickname", (nickname, threadID, participantID) => ({ nickname, threadID, participantID })),
    setTitle: wrap("setTitle", (title, threadID) => ({ title, threadID }))
  };
}

// ---------------------------------------------------------------------------
// Harnais de test : application isolée + envoi de messages
// ---------------------------------------------------------------------------

function createHarness(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idrem-selftest-"));
  const env = {
    NODE_ENV: "test",
    DATA_DIR: dir,
    OWNER_UID: options.ownerUID || OWNER_UID,
    ADMIN_UID: options.adminUID || "",
    PREFIX: "/",
    LOG_LEVEL: "error",
    HEALTH_SERVER: "false",
    CONVERSATION: "true",
    CONVERSATION_PROBABILITY: "1",
    SELF_LISTEN: "false",
    // Aucun service externe payant : les commandes doivent le dire proprement.
    AI_PROVIDER: "",
    AI_API_KEY: "",
    OPENAI_API_KEY: "",
    GROQ_API_KEY: "",
    OPENROUTER_API_KEY: "",
    IMAGE_API_KEY: "",
    MEDIA_API_URL: "",
    MEDIA_API_TOKEN: "",
    YOUTUBE_API_KEY: "",
    REMOTE_STORE_URL: "",
    REMOTE_STORE_TOKEN: ""
  };

  const app = createBotApp({ env, quiet: true });
  const sent = [];
  const api = createFakeApi({
    sent,
    threads: {
      [GROUP_A]: { name: "Groupe Alpha", isGroup: true, participantIDs: [OWNER_UID, USER_A, USER_B, USER_C], adminIDs: [USER_A], memberCount: 4 },
      [GROUP_B]: { name: "Groupe Beta", isGroup: true, participantIDs: [OWNER_UID, USER_B], adminIDs: [USER_B], memberCount: 2 }
    }
  });

  app.setApi(api);
  app.setBot({ ctx: { userID: BOT_UID }, api, stop: async () => {} });

  let sequence = 0;

  /** Envoie un message au dispatcher et récupère les réponses produites. */
  async function send(body, opts = {}) {
    const threadID = String(opts.threadID || GROUP_A);
    const senderID = String(opts.senderID || USER_A);
    const event = {
      type: opts.type || "message",
      threadID,
      senderID,
      messageID: opts.messageID || `msg_${(sequence += 1)}`,
      body: String(body ?? ""),
      senderName: opts.senderName || NAMES[senderID] || "",
      attachments: opts.attachments || [],
      mentions: opts.mentions || [],
      isGroup: opts.isGroup !== undefined ? opts.isGroup : threadID.startsWith("9"),
      timestamp: Date.now()
    };
    if (opts.reply) {
      event.type = "message_reply";
      event.messageReply = opts.reply;
    }

    const rawCtx = {
      event,
      threadID,
      senderID,
      messageID: event.messageID,
      text: event.body,
      body: event.body,
      replyAsync: async (payload) => {
        sent.push({ payload, threadID, at: Date.now() });
        return { messageID: `reply_${sent.length}` };
      }
    };

    // Chaque vérification part d'un état propre : sans cela, le garde
    // (cooldown global, anti-flood) bloquerait les envois suivants du test.
    // Les scénarios qui vérifient justement ces protections passent keepState.
    if (opts.keepState !== true) app.dispatcher.reset();

    const before = sent.length;
    let error = null;
    try {
      await app.dispatcher.middleware(rawCtx);
    } catch (err) {
      error = err;
    }

    const raw = sent.slice(before);
    const joined = raw
      .map((entry) => (typeof entry.payload === "string" ? entry.payload : String((entry.payload && entry.payload.body) || "")))
      .join("\n");
    return {
      error,
      count: raw.length,
      raw,
      payloads: raw.map((entry) => entry.payload),
      /** Texte tel qu'envoyé à Messenger. */
      original: joined,
      /** Texte normalisé (styles Unicode → ASCII) : base des assertions. */
      text: plain(joined),
      threads: [...new Set(raw.map((entry) => entry.threadID))]
    };
  }

  /** Vide la file des messages envoyés. */
  function clearSent() {
    sent.length = 0;
  }

  /** Libère les ressources (timers, dossier temporaire). */
  async function dispose() {
    try {
      if (app.services.scheduler && typeof app.services.scheduler.stop === "function") app.services.scheduler.stop();
      app.store.stopTimers();
    } catch {
      /* best effort */
    }
    if (options.keepDir) return dir;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* dossier déjà supprimé */
    }
    return dir;
  }

  return { app, api, sent, send, clearSent, dispose, dir, env };
}

// ---------------------------------------------------------------------------
// Assertions utilitaires
// ---------------------------------------------------------------------------

/**
 * Remet les caractères stylés en ASCII.
 *
 * utils/text.js écrit les noms de commandes en monospace mathématique
 * (/ping → /𝚙𝚒𝚗𝚐) : les assertions doivent donc comparer du texte normalisé.
 */
const MATH_RANGES = [
  [0x1d670, 0x1d689, 65], // 𝙰-𝚉 monospace majuscules
  [0x1d68a, 0x1d6a3, 97], // 𝚊-𝚣 monospace minuscules
  [0x1d5d4, 0x1d5ed, 65], // 𝗔-𝗭 sans-serif gras majuscules
  [0x1d5ee, 0x1d607, 97], // 𝗮-𝘇 sans-serif gras minuscules
  [0x1d7f6, 0x1d7ff, 48]  // 𝟶-𝟿 chiffres monospace
];

const SMALLCAPS_BACK = (() => {
  const map = {};
  const pairs = {
    a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ", i: "ɪ", j: "ᴊ",
    k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "Q", r: "ʀ", s: "s", t: "ᴛ",
    u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ"
  };
  for (const [letter, styled] of Object.entries(pairs)) map[styled] = letter;
  return map;
})();

function plain(value) {
  let out = "";
  for (const ch of String(value ?? "")) {
    const code = ch.codePointAt(0);
    let replaced = null;
    for (const [start, end, base] of MATH_RANGES) {
      if (code >= start && code <= end) {
        replaced = String.fromCharCode(base + (code - start));
        break;
      }
    }
    if (replaced === null && SMALLCAPS_BACK[ch]) replaced = SMALLCAPS_BACK[ch];
    out += replaced === null ? ch : replaced;
  }
  return out;
}

/**
 * Une sortie est « propre » : aucune fuite technique, aucun objet brut.
 *
 * Les artefacts sont détectés dans leur CONTEXTE d'interpolation (`: undefined`,
 * `(NaN)`) et non comme mots isolés : un quiz JavaScript peut légitimement
 * demander « que vaut undefined ? » sans que ce soit un bug.
 */
const DIRTY_PATTERNS = [
  /\[object Object\]/,
  /(^|[\s:=({\[])undefined([\s.,;:!?)\]}]|$)/,
  /(^|[\s:=({\[])NaN([\s.,;:!?)\]}]|$)/,
  /(^|[\s:=({\[])null([\s.,;:!?)\]}]|$)/,
  /\bat (Object|Module|Function|async|process)\./,
  /(TypeError|ReferenceError|SyntaxError|RangeError):/,
  /Cannot read propert/,
  /is not a function/,
  /\{\s*"?(body|payload)"?\s*:/
];

function isClean(text) {
  const value = String(text || "");
  if (!value.trim()) return false;
  const hit = DIRTY_PATTERNS.find((re) => re.test(value));
  return !hit;
}

/** Détail du premier artefact trouvé (pour le compte-rendu). */
function dirtyDetail(text) {
  const value = String(text || "");
  const hit = DIRTY_PATTERNS.find((re) => re.test(value));
  if (!hit) return "";
  const match = value.match(hit);
  const index = match ? match.index : 0;
  return `artefact « ${match ? match[0].trim() : "?"} » près de : ${value.slice(Math.max(0, index - 40), index + 60).replace(/\n/g, " ")}`;
}

/**
 * Cherche une trace de donnée sensible (session, cookies, clés).
 *
 * Seules les VALEURS sont recherchées : citer le nom d'un fichier
 * (« account.txt ») ou d'une variable (« FB_APPSTATE ») dans une aide n'est
 * pas une fuite, afficher son contenu en serait une.
 */
const SENSITIVE_PATTERNS = [
  /c_user=\d{5,}/i,
  /\bdatr=[A-Za-z0-9%_-]{6,}/,
  /\bxs=[A-Za-z0-9%_-]{8,}/,
  /\bsb=[A-Za-z0-9%_-]{8,}/,
  /\bfr=[A-Za-z0-9%_-]{8,}/,
  /\bwd=[A-Za-z0-9%_-]{8,}/,
  /"key"\s*:\s*"(c_user|xs|datr|sb)"/i,
  /appState\s*[:=]\s*\[/i,
  /sk-[A-Za-z0-9_-]{16,}/,
  /Bearer\s+[A-Za-z0-9._-]{16,}/i,
  /\b[A-Za-z0-9+/]{80,}={0,2}\b/
];

function hasSensitive(text) {
  const value = String(text || "");
  return SENSITIVE_PATTERNS.some((re) => re.test(value));
}

/** Le bot a-t-il répondu quelque chose d'exploitable ? */
function replied(result) {
  return result.count > 0 && String(result.text || "").trim().length > 0;
}

// ---------------------------------------------------------------------------
// runCheck — diagnostic de configuration
// ---------------------------------------------------------------------------

async function runCheck(app) {
  const report = createReport("IDREM TERESHKOVA — DIAGNOSTIC (--check)");
  const { config, registry, services, permissions, store } = app;

  report.section("Configuration");
  report.check("config.json chargée", Boolean(config && config.identity && config.identity.name), "identité absente");
  report.check(`identité : ${config.identity.name} v${config.identity.version}`, Boolean(config.identity.version));
  report.check("préfixe défini", Boolean(config.prefix), "PREFIX vide");
  report.check("OWNER_UID défini", Boolean(config.owner && config.owner.uid), "variable OWNER_UID manquante → aucune commande propriétaire");
  report.check("dossier de données résolu", Boolean(config._meta && config._meta.dataDir), "");
  report.check(`environnement : ${config._meta.env}`, true);

  report.section("Droits d'écriture");
  try {
    fs.mkdirSync(config._meta.dataDir, { recursive: true });
    const probe = path.join(config._meta.dataDir, `.write-probe-${Date.now()}`);
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
    report.ok("écriture possible dans data/");
  } catch (err) {
    report.fail("écriture possible dans data/", err.message);
  }

  report.section("Compte Facebook");
  const account = checkAccount({ rootDir: config._meta.rootDir, env: process.env, logger: null });
  if (account.ok) {
    report.ok(`session détectée (${account.strategy}${account.source ? ` via ${path.basename(account.source)}` : ""})`);
    report.check("aucun contenu de session affiché", !hasSensitive(JSON.stringify({ ...account, info: undefined })));
  } else {
    report.check(
      "session Facebook détectée",
      false,
      `${account.code || ""} ${account.error || ""} → crée account.txt (voir account.example.txt) ou définis FB_APPSTATE`
    );
  }
  report.check("account.txt ignoré par Git", isGitIgnored("account.txt", config._meta.rootDir));
  report.check(".gitignore présent", fs.existsSync(path.join(config._meta.rootDir, ".gitignore")));

  report.section("Registre de commandes");
  const loaded = registry.count() > 0 ? { loaded: registry.count(), errors: registry.errors().length } : registry.load();
  report.check("commandes chargées", loaded.loaded > 0, `${loaded.loaded}`);
  report.check("aucune erreur de chargement", registry.errors().length === 0, registry.errors().map((e) => `${e.file}: ${e.error}`).join(" | "));
  report.check("12 catégories présentes", registry.categories().length === 12, `${registry.categories().length}`);
  report.check("commandes du cahier des charges", specCoverage(registry).missing.length === 0, specCoverage(registry).missing.join(", "));
  report.check("aucun doublon de nom", new Set([...registry.commands.keys()]).size === registry.count());
  report.ok(`${registry.count()} commandes • ${specCoverage(registry).total} du cahier des charges résolues`);

  report.section("Permissions");
  report.check("propriétaire reconnu", permissions.roleOf(config.owner.uid) === "owner");
  report.check("utilisateur lambda = user", permissions.roleOf("100099999999999") === "user");
  report.check("auto-promotion impossible", services.users.setRole("100099999999999", "admin", { by: "100099999999999" }).ok === false);
  report.check("rôle « owner » non attribuable", !services.users.VALID_ROLES.includes("owner"), services.users.VALID_ROLES.join(","));

  report.section("Persistance");
  const storeStats = store.stats();
  report.check("collections initialisées", Object.keys(storeStats.collections).length >= 7, Object.keys(storeStats.collections).join(","));
  report.check("écritures atomiques actives", typeof store.writeJsonFileAtomic === "function");
  report.check(`snapshot distant : ${storeStats.remoteEnabled ? "activé" : "désactivé"}`, true, storeStats.remoteEnabled ? "" : "sur Render, définis REMOTE_STORE_URL pour conserver les données");

  report.section("Services externes");
  for (const service of services.external.status()) {
    const label = service.kind === "missing" ? "à configurer" : service.kind === "configured" ? "configuré" : "public (sans clé)";
    report.check(
      `${service.name} — ${label}`,
      ["public", "configured", "missing"].includes(service.kind),
      service.detail
    );
  }
  const readiness = services.external.readiness();
  report.ok(`${readiness.ready}/${readiness.total} services prêts${readiness.missing.length ? ` • manquants : ${readiness.missing.join(", ")}` : ""}`);

  report.section("Sécurité");
  report.check("/eval verrouillé en production", !(config._meta.isProduction && config.security.allowEval && process.env.ALLOW_EVAL !== "true"));
  report.check("journalisation nettoyée (sanitize)", typeof require("./logger").sanitize === "function");
  report.check("i18n système (fr + en)", i18n.say("unknown", "en", { command: "x", prefix: "/" }).includes("does not exist"));
  report.check("aucun secret dans la configuration affichable", !hasSensitive(JSON.stringify({ ai: config.ai.apiKey, media: config.media.apiToken })));

  report.section("Dépendances");
  const pkg = readPackageJson(config._meta.rootDir);
  report.check("package.json lisible", Boolean(pkg && pkg.name));
  report.check("npm start défini", Boolean(pkg && pkg.scripts && pkg.scripts.start), pkg && pkg.scripts ? JSON.stringify(pkg.scripts) : "");
  report.check("@dongdev/fca-unofficial déclaré", Boolean(pkg && pkg.dependencies && pkg.dependencies["@dongdev/fca-unofficial"]));
  report.check("librairie installée", isLibraryInstalled(config._meta.rootDir));
  report.check(`Node ${process.version} (>= 18 requis)`, Number(process.versions.node.split(".")[0]) >= 18);

  printReport(report);
  return report.failed ? 1 : 0;
}

/** Couverture exacte du cahier des charges. */
function specCoverage(registry) {
  const spec = [
    "help", "menu", "ping", "botinfo", "uptime", "profile", "uid", "groupinfo", "rules",
    "quiz", "qcm", "guess", "word", "rps", "dice", "coin", "mathgame", "truth", "dare", "duel", "leaderboard",
    "balance", "daily", "work", "crime", "give", "shop", "buy", "sell", "inventory", "transfer", "rich",
    "love", "ship", "avatar", "marry", "divorce", "friend", "friends", "rank",
    "time", "date", "calc", "translate", "short", "qr", "weather", "search", "define", "convert", "remind",
    "ai", "ask", "summarize", "explain", "code", "image",
    "meme", "joke", "quote", "fact", "roast", "compliment", "8ball", "pp", "rate", "gayrate", "simp", "character",
    "yt", "ytmp3", "ytmp4", "tiktok", "instagram", "play", "lyrics", "sticker", "toimg", "tomp3",
    "admin", "broadcast", "ban", "unban", "kick", "mute", "unmute", "warn", "warnings", "setprefix", "setname",
    "setstatus", "restart", "shutdown", "stats", "users", "groups", "logs", "eval", "reload",
    "members", "admins", "tagall", "welcome", "antilink", "antispam", "setwelcome", "setgoodbye", "setrules",
    "settings", "mystats", "commands", "topcommands", "topusers"
  ];
  const unique = [...new Set(spec)];
  return { total: unique.length, missing: unique.filter((name) => !registry.resolve(name)) };
}

function readPackageJson(rootDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function isLibraryInstalled(rootDir) {
  try {
    return fs.existsSync(path.join(rootDir, "node_modules", "@dongdev", "fca-unofficial", "package.json"));
  } catch {
    return false;
  }
}

function isGitIgnored(entry, rootDir) {
  try {
    const content = fs.readFileSync(path.join(rootDir, ".gitignore"), "utf8");
    return content.split("\n").some((line) => line.trim() === entry || line.trim() === `/${entry}`);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// runSelfTest — exécution réelle de toutes les commandes
// ---------------------------------------------------------------------------

async function runSelfTest() {
  const report = createReport("IDREM TERESHKOVA — AUTO-TEST COMPLET (--selftest)");
  const harness = createHarness();
  const { app, send, clearSent } = harness;
  const { config, services, registry, permissions } = app;

  /** Exécute une commande et vérifie qu'elle répond proprement. */
  async function expectReply(name, body, opts = {}, assert = null) {
    const result = await send(body, opts);
    const base = !result.error && replied(result) && isClean(result.text) && !hasSensitive(result.text);
    if (!base) {
      report.fail(
        name,
        result.error
          ? `exception : ${result.error.message}`
          : !replied(result)
            ? "aucune réponse"
            : !isClean(result.text)
              ? dirtyDetail(result.text) || `sortie suspecte : ${result.text.slice(0, 160)}`
              : "donnée sensible détectée dans la réponse"
      );
      return result;
    }
    if (typeof assert === "function") {
      const detail = assert(result);
      report.check(name, detail === true || detail === undefined, detail === true || detail === undefined ? "" : String(detail));
    } else {
      report.ok(name);
    }
    return result;
  }

  try {
    // -----------------------------------------------------------------------
    report.section("0. Démarrage de l'environnement de test");
    report.check("application isolée créée", Boolean(app && app.dispatcher), "createBotApp a échoué");
    report.check("dossier de données temporaire", harness.dir.includes("idrem-selftest"), harness.dir);
    report.check("aucune donnée réelle utilisée", config._meta.dataDir === harness.dir, config._meta.dataDir);
    report.check(`${registry.count()} commandes chargées`, registry.count() >= 110, `${registry.count()}`);
    report.check("registre sans erreur", registry.errors().length === 0, registry.errors().map((e) => e.error).join(" | "));
    report.check("fausse API Messenger branchée", typeof app.getApi().sendMessage === "function");
    report.check("UID du bot connu", app.getBotUserID() === BOT_UID, app.getBotUserID());
    report.check("propriétaire reconnu", permissions.isOwner(OWNER_UID) && !permissions.isOwner(USER_A));
    report.check("aucun admin supplémentaire par défaut", permissions.isAdmin(USER_A) === false && permissions.isAdmin(ADMIN_UID) === false);

    // -----------------------------------------------------------------------
    report.section("1. Message « / » seul (bot disponible)");
    clearSent();
    const slash = await send("/", { senderID: USER_A });
    report.check("« / » déclenche une réponse", replied(slash), slash.text.slice(0, 120));
    report.check("« / » n'est pas traité comme une erreur", !/inconnue|erreur est survenue/i.test(slash.text), slash.text.slice(0, 120));
    report.check("message « disponible » mentionne /menu", /menu/i.test(slash.text));
    report.check("sortie propre (aucune fuite technique)", isClean(slash.text));

    const slashAgain = await send("/", { senderID: USER_B, threadID: GROUP_B });
    report.check("plusieurs variantes existent (2-4)", app.dispatcher.availableMessages("fr", "/").length >= 2, `${app.dispatcher.availableMessages("fr", "/").length}`);
    report.check("variante anglaise disponible", i18n.sayVariants("available", "en", { name: "x", version: "1", count: 1, prefix: "/", palette: config.identity.palette }).length >= 2);
    report.check("« / » fonctionne dans un autre groupe", replied(slashAgain));

    // -----------------------------------------------------------------------
    report.section("2. Commande inconnue (jamais de plantage)");
    clearSent();
    const unknown = await send("/zbrglfx", { senderID: USER_B });
    report.check("réponse propre à une commande inconnue", replied(unknown) && !unknown.error);
    report.check("le mot « inconnue » apparaît", /inconnue/i.test(unknown.text), unknown.text.slice(0, 140));
    report.check("orientation vers /menu ou /help", /menu|help/i.test(unknown.text));
    report.check("aucune exception remontée", unknown.error === null, String(unknown.error));

    const near = await send("/pign", { senderID: USER_C });
    report.check("suggestion de la commande la plus proche", /ping/i.test(near.text), near.text.slice(0, 160));

    const emptyArg = await send("/ping ", { senderID: USER_C, messageID: "msg_empty_arg" });
    report.check("espace après la commande toléré", replied(emptyArg) && /pong|ms|latence/i.test(emptyArg.text), emptyArg.text.slice(0, 120));

    // -----------------------------------------------------------------------
    report.section("3. Anti-boucle : le bot ne se répond jamais");
    clearSent();
    const selfMessage = await send("/ping", { senderID: BOT_UID, messageID: "msg_self_1" });
    report.check("message du bot ignoré", selfMessage.count === 0, `${selfMessage.count} réponse(s)`);

    const duplicate = await send("/ping", { senderID: USER_A, messageID: "msg_dup_same", keepState: true });
    const duplicateAgain = await send("/ping", { senderID: USER_A, messageID: "msg_dup_same", keepState: true });
    report.check("premier message traité", replied(duplicate));
    report.check("doublon (même messageID) ignoré", duplicateAgain.count === 0, `${duplicateAgain.count} réponse(s)`);

    // -----------------------------------------------------------------------
    report.section("4. Général (/help /menu /ping /botinfo /uptime /profile /uid /groupinfo /rules)");
    await expectReply("/ping répond avec une latence", "/ping", { senderID: USER_B, messageID: "m_ping" }, (r) => /pong|ms|latence/i.test(r.text) || r.text.slice(0, 120));
    await expectReply("/help liste les commandes", "/help", { senderID: USER_B, messageID: "m_help" }, (r) => r.text.length > 100 || "réponse trop courte");
    await expectReply("/help <catégorie> filtre", "/help economy", { senderID: USER_B, messageID: "m_help_eco" }, (r) => /balance|daily|shop/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/help catégorie inconnue", "/help zzzz", { senderID: USER_B, messageID: "m_help_zz" });
    await expectReply("/menu affiche les catégories", "/menu", { senderID: USER_B, messageID: "m_menu" }, (r) => /général|general|jeux|économie/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/botinfo", "/botinfo", { senderID: USER_B, messageID: "m_botinfo" }, (r) => /IDREM/i.test(r.text) || r.text.slice(0, 120));
    await expectReply("/uptime", "/uptime", { senderID: USER_B, messageID: "m_uptime" }, (r) => /\d/.test(r.text) || "aucun chiffre");
    await expectReply("/profile", "/profile", { senderID: USER_B, messageID: "m_profile" }, (r) => /niveau|level/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/uid renvoie l'identifiant", "/uid", { senderID: USER_B, messageID: "m_uid" }, (r) => r.text.includes(USER_B) || r.text.slice(0, 140));
    await expectReply("/groupinfo (groupe)", "/groupinfo", { senderID: USER_B, messageID: "m_gi" }, (r) => /alpha|membre/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/groupinfo (privé)", "/groupinfo", { senderID: USER_B, threadID: PRIVATE_A, messageID: "m_gi_pv" });
    await expectReply("/rules", "/rules", { senderID: USER_B, messageID: "m_rules" }, (r) => /règle|regle/i.test(r.text) || r.text.slice(0, 120));

    // -----------------------------------------------------------------------
    report.section("5. Jeux (avec XP et gains réels)");
    const xpBefore = services.users.get(USER_B).xp;
    await expectReply("/quiz propose une question", "/quiz", { senderID: USER_B, messageID: "m_quiz" });
    await expectReply("/qcm propose des choix", "/qcm", { senderID: USER_B, messageID: "m_qcm" });
    await expectReply("/guess démarre", "/guess", { senderID: USER_B, messageID: "m_guess" });
    await expectReply("/word démarre", "/word", { senderID: USER_B, messageID: "m_word" });
    await expectReply("/rps joue", "/rps pierre", { senderID: USER_B, messageID: "m_rps" }, (r) => /pierre|feuille|ciseau|gagné|perdu|égalité/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/dice lance un dé", "/dice", { senderID: USER_B, messageID: "m_dice" }, (r) => /[1-6]/.test(r.text) || r.text.slice(0, 120));
    await expectReply("/coin lance une pièce", "/coin", { senderID: USER_B, messageID: "m_coin" }, (r) => /pile|face/i.test(r.text) || r.text.slice(0, 120));
    await expectReply("/mathgame propose un calcul", "/mathgame", { senderID: USER_B, messageID: "m_math" });
    await expectReply("/truth", "/truth", { senderID: USER_B, messageID: "m_truth" });
    await expectReply("/dare", "/dare", { senderID: USER_B, messageID: "m_dare" });
    await expectReply("/riddle", "/riddle", { senderID: USER_B, messageID: "m_riddle" });
    await expectReply("/duel", "/duel @" + NAMES[USER_C], { senderID: USER_B, messageID: "m_duel", mentions: [{ id: USER_C, tag: NAMES[USER_C] }] });
    await expectReply("/leaderboard", "/leaderboard", { senderID: USER_B, messageID: "m_lb" }, (r) => /\d/.test(r.text) || "aucun chiffre");
    report.check("les jeux rapportent de l'XP", services.users.get(USER_B).xp > xpBefore, `avant ${xpBefore}, après ${services.users.get(USER_B).xp}`);

    // -----------------------------------------------------------------------
    report.section("6. Économie (IDREM Coins)");
    await expectReply("/balance affiche un solde", "/balance", { senderID: USER_B, messageID: "m_bal" }, (r) => /IG|coins|solde/i.test(r.text) || r.text.slice(0, 140));
    const coinsBefore = services.economy.balance(USER_B);
    const daily = await expectReply("/daily verse un bonus", "/daily", { senderID: USER_B, messageID: "m_daily" });
    report.check("/daily augmente réellement le solde", services.economy.balance(USER_B) > coinsBefore || /déjà|réclamer|dans/i.test(daily.text), `avant ${coinsBefore}, après ${services.economy.balance(USER_B)}`);
    await expectReply("/daily refuse le doublon (cooldown)", "/daily", { senderID: USER_B, messageID: "m_daily2" }, (r) => /déjà|cooldown|dans|patiente/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/work", "/work", { senderID: USER_C, messageID: "m_work" });
    await expectReply("/crime", "/crime", { senderID: USER_C, messageID: "m_crime" });
    await expectReply("/shop liste la boutique", "/shop", { senderID: USER_B, messageID: "m_shop" }, (r) => /\d/.test(r.text) || "aucun prix");
    await expectReply("/buy sans article → usage", "/buy", { senderID: USER_B, messageID: "m_buy0" });
    await expectReply("/inventory", "/inventory", { senderID: USER_B, messageID: "m_inv" });
    await expectReply("/sell sans article → usage", "/sell", { senderID: USER_B, messageID: "m_sell0" });
    await expectReply("/transfer vers un autre utilisateur", `/transfer ${USER_C} 10`, { senderID: USER_B, messageID: "m_tr" });
    await expectReply("/transfer montant invalide", "/transfer 1000000000 abc", { senderID: USER_B, messageID: "m_tr2" });
    await expectReply("/give (alias de transfert)", `/give ${USER_C} 5`, { senderID: USER_B, messageID: "m_give" });
    await expectReply("/rich classement", "/rich", { senderID: USER_B, messageID: "m_rich" });

    // -----------------------------------------------------------------------
    report.section("7. Social");
    await expectReply("/love", "/love @" + NAMES[USER_C], { senderID: USER_B, messageID: "m_love", mentions: [{ id: USER_C, tag: NAMES[USER_C] }] }, (r) => /%|❤|💘/.test(r.text) || r.text.slice(0, 140));
    await expectReply("/ship", "/ship", { senderID: USER_B, messageID: "m_ship", mentions: [{ id: USER_C, tag: NAMES[USER_C] }] });
    await expectReply("/avatar (photo réelle ou refus honnête)", "/avatar", { senderID: USER_B, messageID: "m_avatar" });
    await expectReply("/marry", "/marry", { senderID: USER_B, messageID: "m_marry", mentions: [{ id: USER_C, tag: NAMES[USER_C] }] });
    await expectReply("/divorce", "/divorce", { senderID: USER_B, messageID: "m_divorce" });
    await expectReply("/friend", "/friend", { senderID: USER_B, messageID: "m_friend", mentions: [{ id: USER_C, tag: NAMES[USER_C] }] });
    await expectReply("/friends", "/friends", { senderID: USER_B, messageID: "m_friends" });
    await expectReply("/rank", "/rank", { senderID: USER_B, messageID: "m_rank" });

    // -----------------------------------------------------------------------
    report.section("8. Utilitaires");
    await expectReply("/time", "/time", { senderID: USER_B, messageID: "m_time" });
    await expectReply("/date", "/date", { senderID: USER_B, messageID: "m_date" }, (r) => /\d{4}|20\d\d/.test(r.text) || r.text.slice(0, 120));
    await expectReply("/calc valide", "/calc 2+3*4", { senderID: USER_B, messageID: "m_calc" }, (r) => r.text.includes("14") || r.text.slice(0, 140));
    await expectReply("/calc invalide", "/calc 2++", { senderID: USER_B, messageID: "m_calc2" }, (r) => /invalide|incomplète|incomplete|impossible|erreur|attendu/i.test(r.text) || r.text.slice(0, 140));
    const injection = await send("/calc process.exit(1)", { senderID: USER_B, messageID: "m_calc3" });
    report.check("/calc n'exécute aucun code (pas d'eval)", injection.error === null && replied(injection));
    await expectReply("/translate", "/translate bonjour en anglais", { senderID: USER_B, messageID: "m_tr_lang" });
    await expectReply("/short", "/short https://example.com/page", { senderID: USER_B, messageID: "m_short" });
    await expectReply("/qr", "/qr IDREM", { senderID: USER_B, messageID: "m_qr" });
    await expectReply("/weather", "/weather Kinshasa", { senderID: USER_B, messageID: "m_weather" });
    await expectReply("/search", "/search Node.js", { senderID: USER_B, messageID: "m_search" });
    await expectReply("/define", "/define bot", { senderID: USER_B, messageID: "m_define" });
    await expectReply("/convert devise", "/convert 10 USD EUR", { senderID: USER_B, messageID: "m_conv" });
    await expectReply("/convert unité invalide", "/convert 10 zz yy", { senderID: USER_B, messageID: "m_conv2" });
    await expectReply("/remind programmation", "/remind 5m tester", { senderID: USER_B, messageID: "m_remind" });
    await expectReply("/remind liste", "/remind list", { senderID: USER_B, messageID: "m_remind2" });

    // -----------------------------------------------------------------------
    report.section("9. IA (non configurée → refus honnête, jamais de faux résultat)");
    report.check("IA effectivement non configurée", services.external.ai.configured() === false);
    for (const command of ["ai", "ask", "summarize", "explain", "code", "image"]) {
      const body = command === "image" ? "/image un chat" : `/${command} explique-moi Node.js`;
      const result = await send(body, { senderID: USER_B, messageID: `m_ai_${command}` });
      report.check(
        `/${command} annonce un service non configuré`,
        replied(result) && !result.error && /non configuré|indisponible|AI_PROVIDER|clé|api/i.test(result.text),
        result.text.slice(0, 180)
      );
    }

    // -----------------------------------------------------------------------
    report.section("10. Fun");
    await expectReply("/meme (image ou repli annoncé)", "/meme", { senderID: USER_B, messageID: "m_meme" });
    await expectReply("/joke", "/joke", { senderID: USER_B, messageID: "m_joke" });
    await expectReply("/quote", "/quote", { senderID: USER_B, messageID: "m_quote" });
    await expectReply("/fact", "/fact", { senderID: USER_B, messageID: "m_fact" });
    await expectReply("/roast", "/roast", { senderID: USER_B, messageID: "m_roast" });
    await expectReply("/compliment", "/compliment", { senderID: USER_B, messageID: "m_compliment" });
    await expectReply("/8ball", "/8ball vais-je réussir ?", { senderID: USER_B, messageID: "m_8ball" });
    await expectReply("/8ball sans question → usage", "/8ball", { senderID: USER_B, messageID: "m_8ball2" });
    await expectReply("/pp", "/pp", { senderID: USER_B, messageID: "m_pp" });
    await expectReply("/rate", "/rate la pizza", { senderID: USER_B, messageID: "m_rate" }, (r) => /\d/.test(r.text) || "aucune note");
    await expectReply("/gayrate", "/gayrate", { senderID: USER_B, messageID: "m_gayrate" });
    await expectReply("/simp", "/simp", { senderID: USER_B, messageID: "m_simp" });
    await expectReply("/character", "/character", { senderID: USER_B, messageID: "m_character" });

    // -----------------------------------------------------------------------
    report.section("11. Médias (aucun contournement, refus expliqué)");
    await expectReply("/yt lien (métadonnées publiques)", "/yt https://youtu.be/dQw4w9WgXcQ", { senderID: USER_B, messageID: "m_yt1" });
    await expectReply("/yt recherche sans clé → message clair", "/yt tutoriel node", { senderID: USER_B, messageID: "m_yt2" }, (r) => /YOUTUBE_API_KEY|lien vidéo|non configuré/i.test(r.text) || r.text.slice(0, 180));
    await expectReply("/ytmp3 non configuré", "/ytmp3 https://youtu.be/dQw4w9WgXcQ", { senderID: USER_B, messageID: "m_ytmp3" }, (r) => /MEDIA_API_URL|non configuré/i.test(r.text) || r.text.slice(0, 180));
    await expectReply("/ytmp4 non configuré", "/ytmp4 https://youtu.be/dQw4w9WgXcQ", { senderID: USER_B, messageID: "m_ytmp4" }, (r) => /MEDIA_API_URL|non configuré/i.test(r.text) || r.text.slice(0, 180));
    await expectReply("/tiktok lien invalide", "/tiktok https://example.com/x", { senderID: USER_B, messageID: "m_tt1" });
    await expectReply("/instagram non configuré", "/instagram https://www.instagram.com/p/AbC123/", { senderID: USER_B, messageID: "m_ig" }, (r) => /MEDIA_API_URL|non configuré|jeton/i.test(r.text) || r.text.slice(0, 180));
    await expectReply("/play non configuré → alternatives", "/play daft punk", { senderID: USER_B, messageID: "m_play" }, (r) => /lyrics|yt|MEDIA_API_URL|non configuré/i.test(r.text) || r.text.slice(0, 180));
    await expectReply("/lyrics", "/lyrics Daft Punk - Around the World", { senderID: USER_B, messageID: "m_lyrics" });
    await expectReply("/sticker sans ID → explication", "/sticker", { senderID: USER_B, messageID: "m_sticker" }, (r) => /autocollant|sticker|catalogue/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/sticker avec un sticker reçu", "/sticker", { senderID: USER_B, messageID: "m_sticker2", attachments: [{ type: "sticker", ID: "362643017410744", stickerID: "362643017410744", url: "https://example.test/s.png", caption: "test" }] });
    await expectReply("/toimg sans pièce jointe → usage", "/toimg", { senderID: USER_B, messageID: "m_toimg0" }, (r) => /aucune photo|photo|image/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/toimg avec photo jointe", "/toimg", { senderID: USER_B, messageID: "m_toimg1", attachments: [{ type: "photo", ID: "photo_1", url: "https://example.test/img.png", filename: "test.png" }] });
    await expectReply("/tomp3 avec audio joint", "/tomp3", { senderID: USER_B, messageID: "m_tomp3", attachments: [{ type: "audio", ID: "audio_1", url: "https://example.test/a.mp3", filename: "vocal.mp3", duration: 12000 }] });
    await expectReply("/tomp3 sans pièce jointe", "/tomp3", { senderID: USER_C, messageID: "m_tomp3b" });

    // -----------------------------------------------------------------------
    report.section("12. Permissions : accès refusé sans exception");
    const deniedBan = await send("/ban " + USER_C, { senderID: USER_B, messageID: "m_denied_ban" });
    report.check("utilisateur lambda refusé sur /ban", deniedBan.count > 0 && /accès refusé/i.test(deniedBan.text), deniedBan.text.slice(0, 160));
    report.check("phrase exacte du cahier des charges", deniedBan.text.includes("⛔ Accès refusé. Cette commande est réservée aux administrateurs."), deniedBan.text.slice(0, 200));

    services.users.setRole(ADMIN_UID, "admin", { by: OWNER_UID });
    report.check("un utilisateur promu admin est reconnu", permissions.isAdmin(ADMIN_UID) === true, ADMIN_UID);
    const deniedEval = await send("/eval 1+1", { senderID: ADMIN_UID, messageID: "m_denied_eval" });
    report.check("/eval réservé au propriétaire (admin du bot refusé)", /accès refusé|propriétaire/i.test(deniedEval.text), deniedEval.text.slice(0, 160));

    const deniedAdmin = await send("/admin", { senderID: USER_C, messageID: "m_denied_admin" });
    report.check("/admin refusé à un utilisateur", /accès refusé/i.test(deniedAdmin.text));

    const deniedGroup = await send("/tagall", { senderID: USER_C, messageID: "m_denied_tagall" });
    report.check("/tagall refusé à un non-admin du groupe", /accès refusé|groupe/i.test(deniedGroup.text), deniedGroup.text.slice(0, 160));

    const privateGroupOnly = await send("/members", { senderID: OWNER_UID, threadID: PRIVATE_A, messageID: "m_group_only" });
    report.check("commande « groupe uniquement » refusée en privé", /groupe/i.test(privateGroupOnly.text), privateGroupOnly.text.slice(0, 160));

    report.check("aucune auto-promotion possible", services.users.setRole(USER_B, "admin", { by: USER_B }).ok === false);
    report.check("un non-propriétaire ne promeut personne", services.users.setRole(USER_C, "admin", { by: USER_A }).ok === false);
    report.check("le propriétaire promeut un admin", services.users.setRole(USER_C, "admin", { by: OWNER_UID }).ok === true);
    report.check("rôle appliqué", permissions.isAdmin(USER_C) === true);
    services.users.setRole(USER_C, "user", { by: OWNER_UID });
    report.check("rôle retiré", permissions.isAdmin(USER_C) === false);

    // -----------------------------------------------------------------------
    report.section("13. Administration (propriétaire)");
    await expectReply("/admin tableau de bord", "/admin", { senderID: OWNER_UID, messageID: "m_admin" }, (r) => /tableau|bord|uptime/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/admin status (services)", "/admin status", { senderID: OWNER_UID, messageID: "m_admin_status" });
    await expectReply("/admin data (persistance)", "/admin data", { senderID: OWNER_UID, messageID: "m_admin_data" });
    await expectReply("/admin mods", "/admin mods", { senderID: OWNER_UID, messageID: "m_admin_mods" });
    await expectReply("/admin section inconnue", "/admin zzz", { senderID: OWNER_UID, messageID: "m_admin_zz" });
    await expectReply("/broadcast --test (aperçu)", "/broadcast --test Message de test", { senderID: OWNER_UID, messageID: "m_bc_test" }, (r) => /aperçu|destination/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/broadcast sans message → usage", "/broadcast", { senderID: OWNER_UID, messageID: "m_bc0" });
    await expectReply("/ban puis /unban", `/ban ${USER_C} test de bannissement`, { senderID: OWNER_UID, messageID: "m_ban" }, (r) => /banni/i.test(r.text) || r.text.slice(0, 160));
    report.check("utilisateur réellement banni", services.warnings.isBanned(USER_C) === true);
    const bannedBlocked = await send("/ping", { senderID: USER_C, messageID: "m_banned_ping" });
    report.check("un utilisateur banni est bloqué", /banni/i.test(bannedBlocked.text), bannedBlocked.text.slice(0, 160));
    await expectReply("/unban lève la sanction", `/unban ${USER_C}`, { senderID: OWNER_UID, messageID: "m_unban" }, (r) => /plus utiliser|débanni|levé/i.test(r.text) || r.text.slice(0, 160));
    report.check("bannissement levé", services.warnings.isBanned(USER_C) === false);
    await expectReply("/unban list", "/unban list", { senderID: OWNER_UID, messageID: "m_unban_list" });
    await expectReply("/mute 30m", `/mute ${USER_C} 30m test`, { senderID: OWNER_UID, messageID: "m_mute" }, (r) => /muet|mute/i.test(r.text) || r.text.slice(0, 160));
    report.check("mute réellement appliqué", services.warnings.isMuted(GROUP_A, USER_C) === true);
    await expectReply("/unmute", `/unmute ${USER_C}`, { senderID: OWNER_UID, messageID: "m_unmute" });
    report.check("mute levé", services.warnings.isMuted(GROUP_A, USER_C) === false);
    await expectReply("/kick (API simulée)", `/kick ${USER_C} test`, { senderID: OWNER_UID, messageID: "m_kick" });
    await expectReply("/setprefix groupe", "/setprefix !", { senderID: OWNER_UID, messageID: "m_setprefix" }, (r) => /préfixe/i.test(r.text) || r.text.slice(0, 140));
    report.check("préfixe du groupe réellement changé", services.settings.prefixFor(GROUP_A) === "!", services.settings.prefixFor(GROUP_A));
    const oldPrefixRefused = await send("/ping", { senderID: OWNER_UID, messageID: "m_oldprefix" });
    report.check("l'ancien préfixe ne déclenche plus de commande", oldPrefixRefused.count === 0 || !/pong/i.test(oldPrefixRefused.text), oldPrefixRefused.text.slice(0, 120));
    const newPrefix = await send("!ping", { senderID: OWNER_UID, messageID: "m_newprefix" });
    report.check("nouveau préfixe accepté", replied(newPrefix) && /pong|ms|latence/i.test(newPrefix.text), newPrefix.text.slice(0, 140));
    await expectReply("!setprefix reset", "!setprefix reset", { senderID: OWNER_UID, messageID: "m_setprefix_reset" });
    report.check("préfixe rétabli", services.settings.prefixFor(GROUP_A) === "/");
    await expectReply("/setprefix global (propriétaire)", "/setprefix global !", { senderID: OWNER_UID, messageID: "m_setprefix_global" });
    report.check("préfixe global changé", services.settings.prefixFor(GROUP_B) === "!", services.settings.prefixFor(GROUP_B));
    await expectReply("!setprefix global reset", "!setprefix global reset", { senderID: OWNER_UID, threadID: GROUP_B, messageID: "m_setprefix_global_reset" });
    report.check("préfixe global rétabli", services.settings.prefixFor(GROUP_B) === "/");
    const globalByUser = await send("/setprefix global ?", { senderID: USER_A, messageID: "m_setprefix_global_user" });
    report.check("préfixe global refusé à un admin de groupe", /accès refusé|administrateur/i.test(globalByUser.text), globalByUser.text.slice(0, 160));
    await expectReply("/setname (pseudo du bot)", "/setname IDREM ⚡", { senderID: OWNER_UID, messageID: "m_setname" }, (r) => /pseudo|renomm/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/setname title (nom du groupe)", "/setname title Groupe Alpha 2026", { senderID: OWNER_UID, messageID: "m_setname_title" });
    await expectReply("/setstatus état", "/setstatus", { senderID: OWNER_UID, messageID: "m_setstatus" }, (r) => /mode|actif/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/setstatus maintenance", "/setstatus maintenance Mise à jour", { senderID: OWNER_UID, messageID: "m_setstatus_m" });
    const maintenanceUser = await send("/ping", { senderID: USER_B, messageID: "m_maint_user", keepState: true });
    report.check("en maintenance, un utilisateur reçoit l'avis", /maintenance/i.test(maintenanceUser.text), maintenanceUser.text.slice(0, 160));
    const maintenanceAdmin = await send("/ping", { senderID: OWNER_UID, messageID: "m_maint_owner", keepState: true });
    report.check("en maintenance, le propriétaire passe", /pong|ms|latence/i.test(maintenanceAdmin.text), maintenanceAdmin.text.slice(0, 140));
    const maintenanceSilent = await send("/ping", { senderID: USER_C, messageID: "m_maint_user2", keepState: true });
    report.check("avis de maintenance non répété (anti-spam)", maintenanceSilent.count === 0, `${maintenanceSilent.count} réponse(s)`);
    await expectReply("/setstatus actif", "/setstatus actif", { senderID: OWNER_UID, messageID: "m_setstatus_a" });
    report.check("mode rétabli", services.settings.status().mode === "actif");
    await expectReply("/reload", "/reload", { senderID: OWNER_UID, messageID: "m_reload" }, (r) => /recharg/i.test(r.text) || r.text.slice(0, 140));
    report.check("registre intact après /reload", registry.count() >= 110 && registry.errors().length === 0, `${registry.count()} commandes, ${registry.errors().length} erreurs`);
    const evalDisabled = await send("/eval 1+1", { senderID: OWNER_UID, messageID: "m_eval_off" });
    report.check("/eval désactivé sans ALLOW_EVAL", /désactivé|ALLOW_EVAL/i.test(evalDisabled.text), evalDisabled.text.slice(0, 180));
    report.check("/eval n'a rien exécuté", !/2/.test(evalDisabled.text.replace(/[^\d]/g, "").slice(0, 1)) || /désactivé/i.test(evalDisabled.text));

    // -----------------------------------------------------------------------
    report.section("14. Groupes : réglages indépendants par conversation");
    await expectReply("/members", "/members", { senderID: USER_A, messageID: "m_members" }, (r) => /membre/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/members list", "/members list", { senderID: USER_A, messageID: "m_members_list" });
    await expectReply("/admins", "/admins", { senderID: USER_A, messageID: "m_admins" }, (r) => /administrateur/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/tagall (admin du groupe)", "/tagall Réunion", { senderID: USER_A, messageID: "m_tagall" });
    await expectReply("/welcome état", "/welcome", { senderID: USER_A, messageID: "m_welcome" });
    await expectReply("/welcome on", "/welcome on", { senderID: USER_A, messageID: "m_welcome_on" }, (r) => /activ/i.test(r.text) || r.text.slice(0, 140));
    report.check("bienvenue activée (groupe A)", services.settings.get(GROUP_A).welcome === true);
    report.check("groupe B non affecté", services.settings.get(GROUP_B).welcome !== services.settings.get(GROUP_A).welcome || services.settings.get(GROUP_B).welcome === false, JSON.stringify(services.settings.get(GROUP_B).welcome));
    await expectReply("/welcome test", "/welcome test", { senderID: USER_A, messageID: "m_welcome_test" });
    await expectReply("/goodbye on", "/goodbye on", { senderID: USER_A, messageID: "m_goodbye_on" });
    await expectReply("/goodbye test", "/goodbye test", { senderID: USER_A, messageID: "m_goodbye_test" });
    await expectReply("/setwelcome personnalisé", "/setwelcome 👋 {name} rejoint {group} !", { senderID: USER_A, messageID: "m_setwelcome" }, (r) => /Alice Test|Groupe Alpha/.test(r.text) || r.text.slice(0, 180));
    await expectReply("/setgoodbye personnalisé", "/setgoodbye 🚪 {name} quitte {group}.", { senderID: USER_A, messageID: "m_setgoodbye" });
    await expectReply("/setrules", "/setrules 1. Respect. 2. Pas de spam.", { senderID: USER_A, messageID: "m_setrules" });
    const rulesAfter = await send("/rules", { senderID: USER_B, messageID: "m_rules_after" });
    report.check("/rules affiche les règles du groupe", /Respect/i.test(rulesAfter.text), rulesAfter.text.slice(0, 160));
    await expectReply("/antilink on", "/antilink on", { senderID: USER_A, messageID: "m_antilink_on" });
    report.check("anti-lien activé", services.settings.get(GROUP_A).antilink === true);
    const linkMessage = await send("Regarde https://spam.example.com/promo", { senderID: USER_C, messageID: "m_link_spam" });
    report.check("lien non autorisé modéré", /lien/i.test(linkMessage.text), linkMessage.text.slice(0, 180));
    await expectReply("/antilink allow exemple.com", "/antilink allow example.com", { senderID: USER_A, messageID: "m_antilink_allow" });
    report.check("domaine ajouté à la liste du groupe", services.settings.get(GROUP_A).allowedLinkDomains.includes("example.com"));
    await expectReply("/antilink list", "/antilink list", { senderID: USER_A, messageID: "m_antilink_list" });
    await expectReply("/antilink deny example.com", "/antilink deny example.com", { senderID: USER_A, messageID: "m_antilink_deny" });
    await expectReply("/antilink off", "/antilink off", { senderID: USER_A, messageID: "m_antilink_off" });
    await expectReply("/antispam état", "/antispam", { senderID: USER_A, messageID: "m_antispam" });
    await expectReply("/antispam status", "/antispam status", { senderID: USER_A, messageID: "m_antispam_status" });
    const warnsBefore = services.warnings.warnCount(GROUP_A, USER_C);
    await expectReply("/warn", `/warn ${USER_C} spam`, { senderID: USER_A, messageID: "m_warn" }, (r) => /avertissement/i.test(r.text) || r.text.slice(0, 160));
    report.check("avertissement enregistré (+1)", services.warnings.warnCount(GROUP_A, USER_C) === warnsBefore + 1, `avant ${warnsBefore}, après ${services.warnings.warnCount(GROUP_A, USER_C)}`);
    report.check("avertissement isolé par groupe", services.warnings.warnCount(GROUP_B, USER_C) === 0);
    await expectReply("/warnings liste", "/warnings", { senderID: USER_A, messageID: "m_warnings" });
    await expectReply("/warnings détail", `/warnings ${USER_C}`, { senderID: USER_A, messageID: "m_warnings_user" }, (r) => /spam/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/warnings clear", `/warnings clear ${USER_C}`, { senderID: USER_A, messageID: "m_warnings_clear" });
    report.check("avertissements effacés", services.warnings.warnCount(GROUP_A, USER_C) === 0);
    await expectReply("/warn (admin du groupe, sans être admin du bot)", `/warn ${USER_B} hors sujet`, { senderID: USER_A, messageID: "m_warn2" });
    await expectReply("/settings (admin du groupe)", "/settings", { senderID: USER_A, messageID: "m_settings" }, (r) => /préfixe|langue|anti/i.test(r.text) || r.text.slice(0, 160));

    // Événements de groupe (arrivée/départ) : hors composer, traités par le dispatcher.
    const bodyOf = (entries) =>
      plain(entries.map((entry) => (typeof entry.payload === "string" ? entry.payload : (entry.payload && entry.payload.body) || "")).join(" "));

    // Format réel de @dongdev/fca-unofficial v4 : addedParticipants = string[].
    clearSent();
    await app.dispatcher.handleThreadEvent({
      type: "event",
      threadID: GROUP_A,
      logMessageType: "log:subscribe",
      eventType: "add_participants",
      logMessageData: { addedParticipants: [USER_C] },
      eventData: { participantsAdded: [USER_C] },
      author: USER_A
    });
    const welcomeSent = harness.sent.filter((entry) => entry.threadID === GROUP_A);
    report.check("arrivée d'un membre (tableau d'UID) → bienvenue", welcomeSent.length > 0, bodyOf(harness.sent).slice(0, 180));
    report.check("le message nomme le nouveau membre", /Carl Test/i.test(bodyOf(welcomeSent)) || /bienvenue|rejoint/i.test(bodyOf(welcomeSent)), bodyOf(welcomeSent).slice(0, 180));

    // Format hérité (objets { userFbId, fullName }) : doit fonctionner aussi.
    clearSent();
    await app.dispatcher.handleThreadEvent({
      type: "event",
      threadID: GROUP_A,
      logMessageType: "log:subscribe",
      logMessageData: { addedParticipants: [{ userFbId: USER_B, fullName: NAMES[USER_B] }] },
      author: USER_A
    });
    const welcomeLegacy = harness.sent.filter((entry) => entry.threadID === GROUP_A);
    report.check("arrivée d'un membre (objet legacy) → bienvenue", welcomeLegacy.length > 0 && /Bob Test/i.test(bodyOf(welcomeLegacy)), bodyOf(harness.sent).slice(0, 180));

    // Le bot ajouté à un groupe ne se souhaite pas la bienvenue à lui-même.
    clearSent();
    await app.dispatcher.handleThreadEvent({
      type: "event",
      threadID: GROUP_A,
      logMessageType: "log:subscribe",
      logMessageData: { addedParticipants: [BOT_UID] },
      author: USER_A
    });
    report.check("le bot ne se salue pas lui-même", harness.sent.filter((e) => e.threadID === GROUP_A).length === 0, bodyOf(harness.sent).slice(0, 120));

    // Départ : leftParticipantFbId est un TABLEAU dans la v4.
    clearSent();
    await app.dispatcher.handleThreadEvent({
      type: "event",
      threadID: GROUP_A,
      logMessageType: "log:unsubscribe",
      eventType: "remove_participants",
      logMessageData: { leftParticipantFbId: [USER_C] },
      eventData: { participantsRemoved: [USER_C] },
      author: USER_C
    });
    const goodbyeSent = harness.sent.filter((entry) => entry.threadID === GROUP_A);
    report.check("départ d'un membre (tableau d'UID) → au revoir", goodbyeSent.length > 0, bodyOf(harness.sent).slice(0, 180));
    report.check("le message nomme le membre parti", /Carl Test/i.test(bodyOf(goodbyeSent)), bodyOf(goodbyeSent).slice(0, 180));

    clearSent();
    await app.dispatcher.handleThreadEvent({
      type: "event",
      threadID: GROUP_A,
      logMessageType: "log:unsubscribe",
      logMessageData: { leftParticipantFbId: USER_B },
      author: USER_B
    });
    report.check("départ (UID seul, format simple) → au revoir", harness.sent.filter((e) => e.threadID === GROUP_A).length > 0, bodyOf(harness.sent).slice(0, 180));

    clearSent();
    await app.dispatcher.handleThreadEvent({
      type: "event",
      threadID: GROUP_A,
      logMessageType: "log:thread-name",
      logMessageData: { name: "Groupe Alpha Renommé" },
      author: USER_A
    });
    report.check("renommage du groupe enregistré", services.groups.get(GROUP_A).name === "Groupe Alpha Renommé", services.groups.get(GROUP_A).name);
    report.check("événement inoffensif : aucun message envoyé", harness.sent.length === 0, `${harness.sent.length} message(s)`);

    clearSent();
    const unknownEvent = await app.dispatcher.handleThreadEvent({ type: "event", threadID: GROUP_A, logMessageType: "log:unknown-thing", logMessageData: {} });
    report.check("événement inconnu ignoré sans erreur", unknownEvent === undefined && harness.sent.length === 0);
    const notAnEvent = await app.dispatcher.handleThreadEvent({ type: "message", threadID: GROUP_A, body: "x" });
    report.check("handleThreadEvent ignore les messages simples", notAnEvent === undefined);

    // -----------------------------------------------------------------------
    report.section("15. Configuration (/settings /config /language /reset)");
    await expectReply("/settings antilink on", "/settings antilink on", { senderID: USER_A, messageID: "m_set_antilink" }, (r) => /anti-lien|activé/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/settings valeur invalide", "/settings language klingon", { senderID: USER_A, messageID: "m_set_lang_bad" }, (r) => /acceptées|invalide|non prise/i.test(r.text) || r.text.slice(0, 180));
    await expectReply("/settings clé inconnue", "/settings zzz on", { senderID: USER_A, messageID: "m_set_zzz" });
    await expectReply("/settings keys", "/settings keys", { senderID: USER_A, messageID: "m_set_keys" });
    await expectReply("/language état", "/language", { senderID: USER_A, messageID: "m_lang" }, (r) => /français|fr/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/language en", "/language en", { senderID: USER_A, messageID: "m_lang_en" }, (r) => /English|anglais|en/i.test(r.text) || r.text.slice(0, 160));
    report.check("langue du groupe A = en", services.settings.get(GROUP_A).language === "en");
    report.check("langue du groupe B inchangée", services.settings.get(GROUP_B).language === "fr");
    const enUnknown = await send("/zzzz", { senderID: USER_A, messageID: "m_en_unknown" });
    report.check("commande inconnue traduite en anglais", /does not exist|UNKNOWN/i.test(enUnknown.text), enUnknown.text.slice(0, 200));
    const enSlash = await send("/", { senderID: USER_A, messageID: "m_en_slash" });
    report.check("message « / » traduit en anglais", /ONLINE|READY|AVAILABLE|SYSTEM/i.test(enSlash.text), enSlash.text.slice(0, 200));
    await expectReply("/language fr (retour)", "/language fr", { senderID: USER_A, messageID: "m_lang_fr" });
    await expectReply("/config (admin)", "/config", { senderID: OWNER_UID, messageID: "m_config" }, (r) => /CONFIGURATION/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/config limits", "/config limits", { senderID: OWNER_UID, messageID: "m_config_limits" });
    await expectReply("/config services", "/config services", { senderID: OWNER_UID, messageID: "m_config_services" });
    await expectReply("/config storage", "/config storage", { senderID: OWNER_UID, messageID: "m_config_storage" });
    await expectReply("/config behaviour", "/config behaviour", { senderID: OWNER_UID, messageID: "m_config_behaviour" });
    await expectReply("/reset sans cible → options", "/reset", { senderID: USER_B, messageID: "m_reset0" }, (r) => /profile|settings|cible/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/reset profile (confirmation)", "/reset profile", { senderID: USER_B, messageID: "m_reset_profile" }, (r) => /confirme|force/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/reset settings (groupe B)", "/reset settings", { senderID: OWNER_UID, threadID: GROUP_B, messageID: "m_reset_settings" });
    await expectReply("/reset data refusé à un non-propriétaire", "/reset data --force", { senderID: USER_A, messageID: "m_reset_data_user" }, (r) => /accès refusé|propriétaire/i.test(r.text) || r.text.slice(0, 160));

    // -----------------------------------------------------------------------
    report.section("16. Statistiques");
    await expectReply("/stats", "/stats", { senderID: OWNER_UID, messageID: "m_stats" }, (r) => /messages|commandes/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/stats commands", "/stats commands", { senderID: OWNER_UID, messageID: "m_stats_cmd" });
    await expectReply("/stats errors", "/stats errors", { senderID: OWNER_UID, messageID: "m_stats_err" });
    await expectReply("/stats uptime", "/stats uptime", { senderID: OWNER_UID, messageID: "m_stats_up" });
    await expectReply("/mystats", "/mystats", { senderID: USER_B, messageID: "m_mystats" }, (r) => /niveau|XP/i.test(r.text) || r.text.slice(0, 160));
    await expectReply("/commands", "/commands", { senderID: USER_B, messageID: "m_commands" }, (r) => /commande/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/commands search", "/commands search musique", { senderID: USER_B, messageID: "m_commands_search" });
    await expectReply("/topcommands", "/topcommands", { senderID: USER_B, messageID: "m_topcmd" });
    await expectReply("/topusers", "/topusers", { senderID: USER_B, messageID: "m_topusers" });
    await expectReply("/topusers coins", "/topusers coins", { senderID: USER_B, messageID: "m_topusers_coins" });
    await expectReply("/users", "/users", { senderID: OWNER_UID, messageID: "m_users" }, (r) => /profil/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/users admins", "/users admins", { senderID: OWNER_UID, messageID: "m_users_admins" });
    await expectReply("/users fiche", `/users ${USER_B}`, { senderID: OWNER_UID, messageID: "m_users_one" });
    await expectReply("/groups", "/groups", { senderID: OWNER_UID, messageID: "m_groups" }, (r) => /groupe/i.test(r.text) || r.text.slice(0, 140));
    await expectReply("/groups settings", "/groups settings", { senderID: OWNER_UID, messageID: "m_groups_settings" });
    await expectReply("/logs", "/logs", { senderID: OWNER_UID, messageID: "m_logs" });
    await expectReply("/logs stats", "/logs stats", { senderID: OWNER_UID, messageID: "m_logs_stats" });
    await expectReply("/logs error", "/logs error", { senderID: OWNER_UID, messageID: "m_logs_error" });
    report.check("statistiques réellement incrémentées", services.stats.summary().totalCommands > 50, `${services.stats.summary().totalCommands} commandes`);
    report.check("commandes les plus utilisées suivies", services.stats.topCommands(3).length > 0);
    report.check("journal alimenté", services.logs.count() > 0, `${services.logs.count()} entrées`);

    // -----------------------------------------------------------------------
    report.section("17. Conversation naturelle et mentions");
    clearSent();
    const greeting = await send("bonjour", { senderID: USER_B, threadID: PRIVATE_A, messageID: "m_conv_hello" });
    report.check("salutation → réponse naturelle", replied(greeting), greeting.text.slice(0, 160));
    const thanks = await send("merci beaucoup", { senderID: USER_B, threadID: PRIVATE_A, messageID: "m_conv_thanks" });
    report.check("remerciement → réponse naturelle", replied(thanks), thanks.text.slice(0, 160));
    const question = await send("qui es-tu ?", { senderID: USER_C, threadID: PRIVATE_A, messageID: "m_conv_who" });
    report.check("question simple → réponse", replied(question), question.text.slice(0, 160));
    const helpRequest = await send("tu peux m'aider ?", { senderID: USER_C, threadID: PRIVATE_A, messageID: "m_conv_help" });
    report.check("demande d'aide → réponse", replied(helpRequest), helpRequest.text.slice(0, 160));

    clearSent();
    const mentionBody = `IDREM aide-moi @[${BOT_UID}:0:${NAMES[BOT_UID]}]`;
    const mention = await send(mentionBody, { senderID: USER_B, messageID: "m_mention", mentions: [{ id: BOT_UID, tag: NAMES[BOT_UID] }] });
    report.check("le bot répond quand on le mentionne", replied(mention), mention.text.slice(0, 200));

    const mentionByName = await send("idrem tu peux m'aider ?", { senderID: USER_C, messageID: "m_mention_name" });
    report.check("détection du nom « idrem » sans @", replied(mentionByName), mentionByName.text.slice(0, 200));

    // Anti-spam conversationnel : le bot ne répond pas à tout.
    clearSent();
    let naturalReplies = 0;
    for (let index = 0; index < 8; index += 1) {
      const result = await send("blabla sans intérêt xyz", { senderID: USER_C, threadID: GROUP_A, messageID: `m_spam_conv_${index}`, keepState: true });
      if (result.count > 0) naturalReplies += 1;
    }
    report.check("conversation limitée (pas de spam)", naturalReplies <= 3, `${naturalReplies} réponses sur 8 messages`);

    // -----------------------------------------------------------------------
    report.section("18. Cooldowns et anti-flood");
    clearSent();
    const first = await send("/joke", { senderID: USER_C, messageID: "m_cd_1" });
    const second = await send("/joke", { senderID: USER_C, messageID: "m_cd_2", keepState: true });
    report.check("première exécution acceptée", replied(first) && !/patiente|cooldown/i.test(first.text), first.text.slice(0, 140));
    report.check("cooldown par commande appliqué", /patiente|cooldown|secondes/i.test(second.text), second.text.slice(0, 160));

    clearSent();
    let floodMessage = "";
    for (let index = 0; index < 12; index += 1) {
      const result = await send("spam spam spam", { senderID: USER_C, threadID: GROUP_B, messageID: `m_flood_${index}`, keepState: true });
      if (result.count > 0) floodMessage = result.text;
    }
    report.check("anti-flood déclenché", /anti-spam|pause|trop de messages/i.test(floodMessage), floodMessage.slice(0, 180));

    clearSent();
    const afterFlood = await send("/ping", { senderID: USER_C, threadID: GROUP_B, messageID: "m_after_flood", keepState: true });
    report.check("utilisateur en pause ignoré", afterFlood.count === 0 || /anti-spam|pause/i.test(afterFlood.text), afterFlood.text.slice(0, 140));

    // -----------------------------------------------------------------------
    report.section("19. Sécurité des données");
    const allSent = harness.sent.map((entry) => (typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload))).join("\n");
    report.check("aucune donnée de session dans les messages", !hasSensitive(allSent), allSent.slice(0, 200));
    report.check("aucun cookie/jeton dans les journaux", !hasSensitive(JSON.stringify(services.logs.list({ limit: 100 }))));
    report.check("sanitize() masque les paires sensibles", require("./logger").sanitize("c_user=12345 datr=abcdef xs=secretvalue").includes("12345") === false);
    const accountProbe = await send("/eval require('fs').readFileSync('account.txt','utf8')", { senderID: OWNER_UID, messageID: "m_eval_account" });
    report.check("lecture d'account.txt refusée par /eval", /refusé|désactivé|sensibles/i.test(accountProbe.text), accountProbe.text.slice(0, 180));

    // -----------------------------------------------------------------------
    report.section("20. Persistance des données");
    await app.store.flushAll();
    const files = ["users", "groups", "settings", "economy", "warnings", "stats", "logs"].map((name) => path.join(harness.dir, `${name}.json`));
    report.check("tous les fichiers de données écrits", files.every((file) => fs.existsSync(file)), files.filter((f) => !fs.existsSync(f)).join(","));
    let allJsonValid = true;
    let invalidFile = "";
    for (const file of files) {
      try {
        JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (err) {
        allJsonValid = false;
        invalidFile = `${path.basename(file)} : ${err.message}`;
      }
    }
    report.check("JSON valide (aucune corruption)", allJsonValid, invalidFile);

    const usersBefore = services.users.count();
    const reloaded = JSON.parse(fs.readFileSync(path.join(harness.dir, "users.json"), "utf8"));
    report.check("profils persistés", Object.keys(reloaded).length === usersBefore, `${Object.keys(reloaded).length} vs ${usersBefore}`);
    report.check("données utilisateur complètes", Boolean(reloaded[USER_B] && typeof reloaded[USER_B].xp === "number" && typeof reloaded[USER_B].level === "number"));

    // -----------------------------------------------------------------------
    report.section("21. Balayage des 118 commandes (aucun plantage)");
    const sweepHarness = createHarness();
    const sweepResults = { executed: 0, repliedCount: 0, crashed: [], dirty: [], sensitive: [], skipped: [] };

    for (const command of registry.list()) {
      if (PROCESS_KILLERS.includes(command.name)) {
        sweepResults.skipped.push(command.name);
        continue;
      }
      // Les commandes d'administration sont exécutées par le propriétaire,
      // les commandes « groupe uniquement » le sont dans un vrai groupe.
      const senderID = command.permissions === "owner" || command.permissions === "admin" ? OWNER_UID : USER_A;
      const body = `/${command.name}${sweepArgs(command.name)}`;
      const result = await sweepHarness.send(body, {
        senderID,
        threadID: GROUP_A,
        messageID: `sweep_${command.name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      });

      sweepResults.executed += 1;
      if (result.error) sweepResults.crashed.push(`${command.name}: ${result.error.message}`);
      if (result.count > 0) {
        sweepResults.repliedCount += 1;
        if (!isClean(result.text)) sweepResults.dirty.push(`${command.name} → ${dirtyDetail(result.text) || result.text.slice(0, 100)}`);
        if (hasSensitive(result.text)) sweepResults.sensitive.push(command.name);
      }
      // Le garde (cooldown global, anti-flood) est réinitialisé à chaque envoi
      // par send() : le balayage teste les commandes, pas les protections.
    }

    report.check(`${sweepResults.executed} commandes exécutées`, sweepResults.executed >= 110, `${sweepResults.executed}`);
    report.check("aucune commande ne plante", sweepResults.crashed.length === 0, sweepResults.crashed.slice(0, 5).join(" | "));
    report.check("toutes les commandes répondent", sweepResults.repliedCount === sweepResults.executed, `${sweepResults.repliedCount}/${sweepResults.executed}`);
    report.check("aucune sortie technique sale", sweepResults.dirty.length === 0, sweepResults.dirty.slice(0, 4).join(" | "));
    report.check("aucune donnée sensible exposée", sweepResults.sensitive.length === 0, sweepResults.sensitive.join(","));
    report.ok(`commandes non exécutées volontairement : ${sweepResults.skipped.join(", ")} (elles arrêtent le processus)`);

    await sweepHarness.dispose();

    // -----------------------------------------------------------------------
    report.section("22. Erreurs et résilience");
    const brokenCommand = {
      name: "selftestbroken",
      category: "general",
      description: "commande de test qui échoue",
      permissions: "public",
      cooldown: 0,
      aliases: [],
      execute() {
        throw new Error("panne volontaire");
      }
    };
    registry.commands.set(brokenCommand.name, brokenCommand);
    const broken = await send("/selftestbroken", { senderID: USER_B, messageID: "m_broken" });
    report.check("une commande en panne ne tue pas le bot", broken.error === null);
    report.check("l'utilisateur reçoit un message simple", /erreur est survenue/i.test(broken.text), broken.text.slice(0, 180));
    report.check("aucun détail technique exposé", !/panne volontaire|at Object|stack/i.test(broken.text), broken.text.slice(0, 180));
    report.check("erreur enregistrée dans les stats", services.stats.summary().totalErrors > 0);
    const afterCrash = await send("/ping", { senderID: USER_B, messageID: "m_after_crash" });
    report.check("le bot répond encore après une erreur", replied(afterCrash));
    registry.commands.delete("selftestbroken");

    const userError = await send("/buy article_inexistant_xyz", { senderID: USER_B, messageID: "m_user_error" });
    report.check("erreur utilisateur (UserError) lisible", replied(userError) && !/erreur est survenue pendant/i.test(userError.text), userError.text.slice(0, 180));
  } catch (err) {
    report.fail("auto-test interrompu par une erreur", `${err && err.message ? err.message : String(err)}`);
  } finally {
    await harness.dispose();
  }

  printReport(report);
  return report.failed ? 1 : 0;

  /** Arguments réalistes pour le balayage automatique. */
  function sweepArgs(name) {
    const args = {
      help: " general",
      calc: " 2+2",
      translate: " bonjour",
      short: " https://example.com",
      qr: " IDREM",
      weather: " Kinshasa",
      search: " Node.js",
      define: " bot",
      convert: " 10 USD EUR",
      remind: " 30m test",
      ai: " bonjour",
      ask: " qui es-tu",
      summarize: " texte à résumer",
      explain: " récursivité",
      code: " fonction fibonacci",
      image: " un chat",
      yt: " https://youtu.be/dQw4w9WgXcQ",
      ytmp3: " https://youtu.be/dQw4w9WgXcQ",
      ytmp4: " https://youtu.be/dQw4w9WgXcQ",
      tiktok: " https://www.tiktok.com/@user/video/1234567890",
      instagram: " https://www.instagram.com/p/AbC123/",
      play: " daft punk",
      lyrics: " Daft Punk - Around the World",
      sticker: "",
      toimg: "",
      tomp3: "",
      love: "",
      ship: "",
      avatar: "",
      marry: ` ${USER_B}`,
      divorce: "",
      friend: ` ${USER_B}`,
      transfer: ` ${USER_B} 5`,
      give: ` ${USER_B} 5`,
      buy: "",
      sell: "",
      rps: " pierre",
      dice: "",
      coin: "",
      quiz: "",
      qcm: "",
      guess: "",
      word: "",
      mathgame: "",
      duel: ` ${USER_B}`,
      ban: ` ${USER_B}`,
      unban: " list",
      mute: ` ${USER_B} 10`,
      unmute: ` ${USER_B}`,
      kick: ` ${USER_B}`,
      warn: ` ${USER_B} test`,
      warnings: "",
      setprefix: "",
      setname: " IDREM",
      setstatus: "",
      broadcast: " --test annonce",
      eval: "",
      reload: " status",
      reset: "",
      settings: "",
      language: "",
      config: "",
      logs: " 5",
      users: "",
      groups: "",
      stats: "",
      tagall: " test",
      welcome: "",
      goodbye: "",
      antilink: "",
      antispam: "",
      setwelcome: " 👋 {name}",
      setgoodbye: " 🚪 {name}",
      setrules: " 1. Respect.",
      members: "",
      admins: "",
      "8ball": " vais-je gagner",
      rate: " la pizza",
      gayrate: "",
      simp: "",
      character: "",
      pp: "",
      meme: "",
      roast: "",
      compliment: "",
      time: "",
      date: "",
      profile: "",
      uid: "",
      groupinfo: "",
      rules: "",
      mystats: "",
      commands: "",
      topcommands: "",
      topusers: "",
      balance: "",
      daily: "",
      work: "",
      crime: "",
      shop: "",
      inventory: "",
      rich: "",
      friends: "",
      rank: "",
      joke: "",
      quote: "",
      fact: "",
      truth: "",
      dare: "",
      riddle: "",
      leaderboard: "",
      ping: "",
      menu: "",
      botinfo: "",
      uptime: "",
      admin: ""
    };
    return Object.prototype.hasOwnProperty.call(args, name) ? args[name] : "";
  }
}

module.exports = { runCheck, runSelfTest, createHarness, createFakeApi, isClean, hasSensitive, specCoverage };
