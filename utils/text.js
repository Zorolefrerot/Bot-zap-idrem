"use strict";

/**
 * utils/text.js
 * ---------------------------------------------------------------------------
 * Système visuel du bot : cadres, séparateurs, barres de progression, styles
 * Unicode et mise en forme des nombres.
 *
 * Objectif : une interface lisible sur téléphone, cohérente (🔵 ⚫ ⚪), sans
 * markdown (Messenger n'en affiche aucun — les backticks apparaissent telles
 * quelles, elles sont donc proscrites).
 * ---------------------------------------------------------------------------
 */

const DEFAULT_PALETTE = { primary: "🔵", dark: "⚫", light: "⚪", accent: "⚡" };
const DEFAULT_NAME = "IDREM TERESHKOVA";

const theme = {
  name: DEFAULT_NAME,
  short: "IDREM",
  palette: { ...DEFAULT_PALETTE },
  version: "2.0.0",
  width: 34
};

/** Applique l'identité du bot (appelé au démarrage depuis config.json). */
function configure(identity = {}) {
  if (identity.name) theme.name = String(identity.name);
  if (identity.short) theme.short = String(identity.short);
  if (identity.version) theme.version = String(identity.version);
  if (identity.palette && typeof identity.palette === "object") {
    theme.palette = { ...DEFAULT_PALETTE, ...identity.palette };
  }
  if (Number(identity.width) > 20) theme.width = Number(identity.width);
  return theme;
}

function palette() {
  return theme.palette;
}

// ---------------------------------------------------------------------------
// Nombres et texte
// ---------------------------------------------------------------------------

/** 4250 → "4 250" (groupement français, espace simple : sûr partout). */
function num(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "0");
  const sign = n < 0 ? "-" : "";
  const [int, dec] = Math.abs(n).toString().split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return sign + grouped + (dec ? `,${dec}` : "");
}

/** Tronque proprement un texte long. */
function cut(text, max = 120) {
  const str = String(text ?? "");
  if (str.length <= max) return str;
  return `${str.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Retire les sauts de ligne multiples et les espaces superflus. */
function tidy(text) {
  return String(text ?? "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------------------
// Styles Unicode (usage modéré)
// ---------------------------------------------------------------------------

function mapRange(text, lowerStart, upperStart) {
  return String(text ?? "")
    .split("")
    .map((ch) => {
      const code = ch.codePointAt(0);
      if (code >= 97 && code <= 122) return String.fromCodePoint(lowerStart + (code - 97));
      if (code >= 65 && code <= 90) return String.fromCodePoint(upperStart + (code - 65));
      return ch;
    })
    .join("");
}

const SMALLCAPS = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ", i: "ɪ", j: "ᴊ",
  k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "Q", r: "ʀ", s: "s", t: "ᴛ",
  u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ"
};

/** 𝚖𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎 — utilisé pour les noms de commandes. */
function mono(text) {
  return mapRange(text, 0x1d68a, 0x1d670);
}

/** 𝗯𝗼𝗹𝗱 — titres courts uniquement. */
function bold(text) {
  return mapRange(text, 0x1d5ee, 0x1d5d4);
}

/** ᴘᴇᴛɪᴛᴇs ᴄᴀᴘɪᴛᴀʟᴇs — libellés discrets. */
function smallcaps(text) {
  return String(text ?? "")
    .toLowerCase()
    .split("")
    .map((ch) => SMALLCAPS[ch] || ch)
    .join("");
}

/** Nom de commande mis en forme : /ping → /𝚙𝚒𝚗𝚐 */
function cmd(name, prefix = "/") {
  return `${prefix}${mono(String(name ?? ""))}`;
}

// ---------------------------------------------------------------------------
// Séparateurs et cadres
// ---------------------------------------------------------------------------

/** Ligne de séparation discrète. */
function rule(char = "─", width = theme.width) {
  return char.repeat(Math.max(6, width));
}

function dots(width = theme.width) {
  return "·".repeat(Math.max(6, width));
}

function stars(width = theme.width) {
  return "━".repeat(Math.max(4, Math.round(width / 2)));
}

/**
 * Cadre principal du bot.
 *
 *   box("PROFIL", ["👤 Nom : Merdi", "⭐ Niveau : 12"])
 *
 *   ╭───「 🔵 PROFIL 」
 *   │
 *   │ 👤 Nom : Merdi
 *   │ ⭐ Niveau : 12
 *   │
 *   ╰───────────────
 *
 * @param {string} title
 * @param {string[]|string} lines  chaque élément peut contenir des "\n"
 * @param {{ icon?: string, footer?: string[]|string, tight?: boolean }} [opts]
 */
function box(title, lines, opts = {}) {
  const icon = opts.icon !== undefined ? opts.icon : theme.palette.primary;
  const flat = (Array.isArray(lines) ? lines : [lines])
    .flatMap((line) => String(line ?? "").split("\n"))
    .filter((line) => line !== undefined);

  const out = [];
  const head = title ? `${icon ? `${icon} ` : ""}${String(title).toUpperCase()}` : icon;
  out.push(`╭───「 ${head} 」`);
  if (!opts.tight) out.push("│");
  for (const line of flat) {
    out.push(line === "" ? "│" : `│ ${line}`);
  }

  const footer = opts.footer === undefined ? null : Array.isArray(opts.footer) ? opts.footer : [opts.footer];
  if (footer && footer.length) {
    out.push("│");
    for (const line of footer) out.push(line === "" ? "│" : `│ ${line}`);
  }

  if (!opts.tight) out.push("│");
  out.push(`╰${rule("─")}`);
  return out.join("\n");
}

/** Variante sombre : pour les erreurs et les refus. */
function darkBox(title, lines, opts = {}) {
  return box(title, lines, { icon: theme.palette.dark, ...opts });
}

/** Variante claire : informations neutres. */
function lightBox(title, lines, opts = {}) {
  return box(title, lines, { icon: theme.palette.light, ...opts });
}

/**
 * Bloc simple sans cadre complet — pour les messages courts.
 *
 *   header("ÉCONOMIE")  →  ━━━「 🔵 ÉCONOMIE 」━━━
 */
function header(title, icon) {
  const ico = icon === undefined ? theme.palette.primary : icon;
  const t = String(title || "").toUpperCase();
  const side = stars(14);
  return `${side}「 ${ico ? `${ico} ` : ""}${t} 」${side}`;
}

/** Ligne clé/valeur alignée. */
function kv(label, value, icon = "") {
  return `${icon ? `${icon} ` : ""}${label} : ${value}`;
}

/** Liste à puces. */
function list(items, bullet = "•") {
  return (Array.isArray(items) ? items : [items]).map((i) => `${bullet} ${i}`).join("\n");
}

/** Puce hiérarchique pour les menus. */
function branch(items) {
  const arr = Array.isArray(items) ? items : [items];
  return arr.map((item, i) => (i === arr.length - 1 ? `└ ${item}` : `├ ${item}`)).join("\n");
}

/** Barre de progression : ▰▰▰▰▱▱▱▱▱▱ 40% */
function progress(current, max, width = 10) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, Number(current) / Number(max))) : 0;
  const filled = Math.round(ratio * width);
  return `${"▰".repeat(filled)}${"▱".repeat(Math.max(0, width - filled))} ${Math.round(ratio * 100)}%`;
}

/** Signature de fin de message. */
function footer(text) {
  return `${dots(16)}\n${theme.palette.dark} ${text || theme.name}`;
}

/** Icônes de statut standardisés. */
const ICONS = {
  ok: "✅",
  no: "⛔",
  warn: "⚠️",
  info: "ℹ️",
  error: "🚨",
  money: "💰",
  xp: "✨",
  level: "⭐",
  time: "⏱️",
  user: "👤",
  group: "👥",
  crown: "👑",
  bolt: "⚡",
  pin: "📌",
  book: "📚",
  gear: "⚙️",
  chart: "📊",
  robot: "🤖",
  heart: "❤️",
  fire: "🔥",
  game: "🎮",
  tool: "🛠️",
  media: "📥",
  fun: "😂",
  social: "🧑‍🤝‍🧑",
  plug: "🔌",
  lock: "🔒",
  target: "🎯",
  clock: "⏰"
};

/**
 * Bloc d'information neutre.
 * @param {string} title
 * @param {string[]|string} lines
 * @param {{ icon?: string, footer?: string[]|string, tight?: boolean }} [opts]
 */
function notice(title, lines, opts = {}) {
  return box(title, lines, { icon: theme.palette.light, ...opts });
}

/** Succès d'une action. */
function ok(message, detail) {
  return box("SUCCÈS", [String(message || ""), detail ? String(detail) : ""].filter(Boolean), {
    icon: ICONS.ok
  });
}

/** Avertissement non bloquant. */
function warn(message, detail) {
  return box("ATTENTION", [String(message || ""), detail ? String(detail) : ""].filter(Boolean), {
    icon: ICONS.warn
  });
}

/** Information simple, sans titre. */
function info(message, detail) {
  return lightBox("INFO", [String(message || ""), detail ? String(detail) : ""].filter(Boolean));
}

/** Message « service non configuré » — uniforme dans tout le bot. */
function notConfigured(service, detail) {
  const lines = [
    `${ICONS.plug} Le service « ${service} » n'est pas configuré.`,
    "",
    detail || "Aucune clé API n'est définie pour cette fonctionnalité.",
    "",
    "Le bot ne simule jamais un résultat : rien n'est inventé."
  ];
  return box("SERVICE INDISPONIBLE", lines, { icon: theme.palette.light });
}

/** Message d'usage invalide — uniforme dans tout le bot. */
function usage(command, expected, example) {
  const lines = [`${ICONS.warn} Paramètres manquants ou invalides.`, ""];
  if (expected) lines.push(`Attendu : ${expected}`);
  if (example) lines.push(`Exemple : ${example}`);
  return box("USAGE", lines.filter(Boolean), { icon: theme.palette.light });
}

/**
 * Refus d'accès — uniforme dans tout le bot.
 *
 * Accepte soit un rôle (« owner » / « admin » / « groupadmin »), soit un motif
 * libre en première position.
 *
 * @param {string} reasonOrRole
 * @param {string} [detail] ligne complémentaire (niveau requis, aide…)
 */
function denied(reasonOrRole, detail) {
  const value = String(reasonOrRole || "admin").trim();
  const roleMessages = {
    owner: "Cette commande est réservée au propriétaire du bot.",
    admin: "Cette commande est réservée aux administrateurs.",
    groupadmin: "Cette commande est réservée aux administrateurs du groupe.",
    public: ""
  };
  const known = Object.prototype.hasOwnProperty.call(roleMessages, value.toLowerCase());
  const lines = [
    known ? roleMessages[value.toLowerCase()] : `⛔ ${value}`,
    detail ? String(detail) : "",
    "",
    `${ICONS.lock} Ton rôle actuel ne permet pas cette action.`
  ].filter(Boolean);
  return darkBox("ACCÈS REFUSÉ", lines);
}

/**
 * Erreur générique envoyée à l'utilisateur (jamais de détail technique).
 *
 * @param {string} [titleOrCommand] nom de commande (« /ping ») ou titre libre
 * @param {string} [hint] conseil affiché sous le message
 */
function errorBox(titleOrCommand, hint) {
  const value = String(titleOrCommand || "").trim();
  const isCommand = value.startsWith("/") || /^[a-z0-9_-]{1,24}$/i.test(value);
  const headline = !value
    ? "Une erreur est survenue pendant l'exécution de cette commande."
    : isCommand
      ? `Une erreur est survenue pendant l'exécution de ${cmd(value.replace(/^\//, ""))}.`
      : value;
  return darkBox("ERREUR", [
    headline,
    "",
    hint ? String(hint) : "Réessaie dans quelques secondes.",
    `${ICONS.info} Les détails techniques restent dans les journaux du bot.`
  ]);
}

module.exports = {
  configure,
  palette,
  theme,
  num,
  cut,
  tidy,
  mono,
  bold,
  smallcaps,
  cmd,
  rule,
  dots,
  stars,
  box,
  darkBox,
  lightBox,
  header,
  kv,
  list,
  branch,
  progress,
  footer,
  ICONS,
  notice,
  ok,
  warn,
  info,
  notConfigured,
  usage,
  denied,
  errorBox
};
