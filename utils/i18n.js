"use strict";

/**
 * utils/i18n.js
 * ---------------------------------------------------------------------------
 * Traduction des MESSAGES SYSTÈME du bot.
 *
 * Périmètre exact (tout le reste reste en français, et le bot le dit) :
 *   • message « / » seul (bot disponible)      • commande inconnue
 *   • accès refusé / groupe requis             • cooldown d'attente
 *   • anti-spam (pause + déclenchement)        • banni / muet
 *   • erreur générique                         • mode maintenance
 *
 * Les descriptions de commandes, les jeux, l'économie et le corpus
 * conversationnel sont rédigés en français : ce module ne prétend donc PAS
 * traduire l'intégralité du bot. `/language` affiche cette limite clairement.
 *
 * Chaque entrée renvoie un DESCRIPTIF de rendu ({ style, title, lines, … }) :
 * c'est utils/text.js qui fabrique le message final, donc le style 🔵⚫⚪ reste
 * uniforme quelle que soit la langue.
 * ---------------------------------------------------------------------------
 */

const text = require("./text");

const DEFAULT_LANGUAGE = "fr";
const SUPPORTED = ["fr", "en"];

const LANGUAGES = {
  fr: { code: "fr", label: "Français", flag: "🇫🇷" },
  en: { code: "en", label: "English", flag: "🇬🇧" }
};

/** Normalise une langue (inconnue → français). */
function resolveLanguage(value) {
  const raw = String(value || "").trim().toLowerCase().slice(0, 5);
  if (SUPPORTED.includes(raw)) return raw;
  const base = raw.split("-")[0];
  return SUPPORTED.includes(base) ? base : DEFAULT_LANGUAGE;
}

/** Remplace {variable} par sa valeur. */
function fill(template, vars = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}

const { ICONS, cmd, list } = text;

/** Chaînes d'interface des encadrés système (identiques à utils/text.js en FR). */
const UI = {
  fr: {
    deniedTitle: "ACCÈS REFUSÉ",
    deniedFooter: `${ICONS.lock} Ton rôle actuel ne permet pas cette action.`,
    errorTitle: "ERREUR",
    errorHeadline: "Une erreur est survenue pendant l'exécution de cette commande.",
    errorHint: "Réessaie dans quelques secondes.",
    errorFooter: `${ICONS.info} Les détails techniques restent dans les journaux du bot.`
  },
  en: {
    deniedTitle: "ACCESS DENIED",
    deniedFooter: `${ICONS.lock} Your current role does not allow this action.`,
    errorTitle: "ERROR",
    errorHeadline: "An error occurred while running this command.",
    errorHint: "Please try again in a few seconds.",
    errorFooter: `${ICONS.info} Technical details stay in the bot logs.`
  }
};

// ---------------------------------------------------------------------------
// FRANÇAIS
// ---------------------------------------------------------------------------

const FR = {
  /** Le message « / » seul : 4 variantes, tirées au hasard. */
  available(v) {
    return [
      {
        style: "box",
        icon: "accent",
        title: "SYSTÈME OPÉRATIONNEL",
        lines: [
          `${v.palette.primary} ${v.name} — v${v.version}`,
          `${ICONS.chart} ${v.count} commandes actives`,
          "",
          list([
            `${cmd("menu", v.prefix)} → toutes les catégories`,
            `${cmd("help", v.prefix)} → liste détaillée`,
            `${cmd("ping", v.prefix)} → latence du bot`,
            `${cmd("profile", v.prefix)} → ton profil`
          ])
        ],
        footer: `${ICONS.bolt} Tape ${cmd("menu", v.prefix)} pour commencer.`
      },
      {
        style: "lightBox",
        title: "BOT DISPONIBLE",
        lines: [
          `⚡ ${v.name} est en ligne et prêt.`,
          "",
          `${ICONS.pin} ${cmd("menu", v.prefix)} — explorer les catégories`,
          `${ICONS.book} ${cmd("help", v.prefix)} <catégorie> — détail d'une catégorie`,
          `${ICONS.game} ${cmd("quiz", v.prefix)} — lancer une partie`,
          `${ICONS.money} ${cmd("daily", v.prefix)} — bonus quotidien`,
          "",
          "💬 Tu peux aussi me parler normalement : je réponds quand on me mentionne."
        ]
      },
      {
        style: "box",
        icon: "accent",
        title: "EN LIGNE",
        lines: [
          `${v.palette.primary} ${v.name}`,
          `${ICONS.ok} Connexion : active`,
          `${ICONS.chart} Commandes : ${v.count}`,
          `${ICONS.gear} Préfixe : ${v.prefix}`,
          "",
          `Écris ${cmd("menu", v.prefix)} pour la liste complète.`
        ]
      },
      {
        style: "lightBox",
        title: "PRÊT",
        lines: [
          `⚡ Système opérationnel — ${v.name} v${v.version}.`,
          "",
          `${cmd("menu", v.prefix)} · ${cmd("help", v.prefix)} · ${cmd("ping", v.prefix)}`,
          `${cmd("profile", v.prefix)} · ${cmd("daily", v.prefix)} · ${cmd("quiz", v.prefix)}`,
          "",
          "Une question ? Écris-la simplement, ou mentionne-moi."
        ]
      }
    ];
  },

  unknown(v) {
    const lines = [
      `${ICONS.warn} La commande ${cmd(v.command, v.prefix)} n'existe pas.`,
      "",
      `${ICONS.pin} Utilise ${cmd("menu", v.prefix)} pour voir les catégories,`,
      `   ou ${cmd("help", v.prefix)} <catégorie> pour le détail.`
    ];
    if (v.suggestion) lines.push("", `🔎 Voulais-tu dire ${cmd(v.suggestion, v.prefix)} ?`);
    return { style: "darkBox", title: "COMMANDE INCONNUE", lines };
  },

  denied(v) {
    return {
      style: "darkBox",
      title: "ACCÈS REFUSÉ",
      lines: [
        `⛔ Accès refusé. ${v.reason || "Cette commande est réservée aux administrateurs."}`,
        v.level ? `${ICONS.lock} Niveau requis : ${v.level}` : "",
        `${cmd("help", v.prefix)} pour les commandes accessibles à tous.`
      ].filter(Boolean)
    };
  },

  groupOnly(v) {
    return {
      style: "notice",
      title: "GROUPE REQUIS",
      lines: [`👥 ${cmd(v.command, v.prefix)} ne fonctionne que dans un groupe.`]
    };
  },

  cooldown(v) {
    return {
      style: "notice",
      title: "COOLDOWN",
      lines: [
        `${ICONS.clock} Patiente ${v.wait} seconde${v.wait > 1 ? "s" : ""}.`,
        v.label ? `Commande : ${v.label}` : "",
        "💡 Cette limite protège le groupe et ton compte."
      ].filter(Boolean)
    };
  },

  floodPause(v) {
    return {
      style: "warn",
      title: "Anti-spam : tu envoies trop de messages.",
      lines: [`Pause de ${v.remaining} — le bot ignore tes commandes.`]
    };
  },

  floodTrigger(v) {
    return {
      style: "warn",
      title: "🛑 Anti-spam déclenché.",
      lines: [`Trop de messages en moins de ${v.window} — pause de ${v.remaining}.`]
    };
  },

  banned(v) {
    return {
      style: "denied",
      title: "Tu es banni(e) de ce bot.",
      lines: [v.reason ? `Motif : ${v.reason}` : "", "Contacte le propriétaire pour une révision."].filter(Boolean).join(" — ")
    };
  },

  muted(v) {
    return {
      style: "notice",
      title: "MUET",
      lines: ["🔇 Tu es actuellement muet dans cette conversation.", `Fin dans : ${v.remaining}`, v.reason ? `Motif : ${v.reason}` : ""].filter(Boolean)
    };
  },

  maintenance(v) {
    return {
      style: "warn",
      title: "MAINTENANCE",
      lines: [
        `${v.icon} Le bot est en MAINTENANCE.`,
        v.text || "Seuls les administrateurs peuvent l'utiliser pour le moment.",
        "",
        "⚡ Les données sont conservées ; le service revient dès que la maintenance est terminée."
      ]
    };
  },

  error() {
    return {
      style: "errorBox",
      title: "",
      hint: "Réessaie dans quelques secondes."
    };
  }
};

// ---------------------------------------------------------------------------
// ENGLISH
// ---------------------------------------------------------------------------

const EN = {
  available(v) {
    return [
      {
        style: "box",
        icon: "accent",
        title: "SYSTEM ONLINE",
        lines: [
          `${v.palette.primary} ${v.name} — v${v.version}`,
          `${ICONS.chart} ${v.count} active commands`,
          "",
          list([
            `${cmd("menu", v.prefix)} → all categories`,
            `${cmd("help", v.prefix)} → detailed list`,
            `${cmd("ping", v.prefix)} → bot latency`,
            `${cmd("profile", v.prefix)} → your profile`
          ])
        ],
        footer: `${ICONS.bolt} Type ${cmd("menu", v.prefix)} to get started.`
      },
      {
        style: "lightBox",
        title: "BOT AVAILABLE",
        lines: [
          `⚡ ${v.name} is online and ready.`,
          "",
          `${ICONS.pin} ${cmd("menu", v.prefix)} — browse categories`,
          `${ICONS.book} ${cmd("help", v.prefix)} <category> — details of one category`,
          `${ICONS.game} ${cmd("quiz", v.prefix)} — start a game`,
          `${ICONS.money} ${cmd("daily", v.prefix)} — daily bonus`,
          "",
          "💬 You can also talk to me normally: I reply when I am mentioned."
        ]
      },
      {
        style: "box",
        icon: "accent",
        title: "ONLINE",
        lines: [
          `${v.palette.primary} ${v.name}`,
          `${ICONS.ok} Connection: active`,
          `${ICONS.chart} Commands: ${v.count}`,
          `${ICONS.gear} Prefix: ${v.prefix}`,
          "",
          `Type ${cmd("menu", v.prefix)} for the full list.`
        ]
      },
      {
        style: "lightBox",
        title: "READY",
        lines: [
          `⚡ System online — ${v.name} v${v.version}.`,
          "",
          `${cmd("menu", v.prefix)} · ${cmd("help", v.prefix)} · ${cmd("ping", v.prefix)}`,
          `${cmd("profile", v.prefix)} · ${cmd("daily", v.prefix)} · ${cmd("quiz", v.prefix)}`,
          "",
          "Got a question? Just write it, or mention me."
        ]
      }
    ];
  },

  unknown(v) {
    const lines = [
      `${ICONS.warn} The command ${cmd(v.command, v.prefix)} does not exist.`,
      "",
      `${ICONS.pin} Use ${cmd("menu", v.prefix)} to browse categories,`,
      `   or ${cmd("help", v.prefix)} <category> for details.`
    ];
    if (v.suggestion) lines.push("", `🔎 Did you mean ${cmd(v.suggestion, v.prefix)}?`);
    return { style: "darkBox", title: "UNKNOWN COMMAND", lines };
  },

  denied(v) {
    const reasons = {
      owner: "This command is reserved for the bot owner.",
      admin: "This command is reserved for administrators.",
      groupadmin: "This command is reserved for group administrators."
    };
    return {
      style: "darkBox",
      title: "ACCESS DENIED",
      lines: [
        `⛔ Access denied. ${reasons[v.levelKey] || reasons.admin}`,
        v.level ? `${ICONS.lock} Required level: ${v.level}` : "",
        `${cmd("help", v.prefix)} lists the commands available to everyone.`
      ].filter(Boolean)
    };
  },

  groupOnly(v) {
    return {
      style: "notice",
      title: "GROUP REQUIRED",
      lines: [`👥 ${cmd(v.command, v.prefix)} only works inside a group.`]
    };
  },

  cooldown(v) {
    return {
      style: "notice",
      title: "COOLDOWN",
      lines: [
        `${ICONS.clock} Wait ${v.wait} second${v.wait > 1 ? "s" : ""}.`,
        v.label ? `Command: ${v.label}` : "",
        "💡 This limit protects the group and your account."
      ].filter(Boolean)
    };
  },

  floodPause(v) {
    return {
      style: "warn",
      title: "Anti-spam: you are sending too many messages.",
      lines: [`Paused for ${v.remaining} — the bot ignores your commands.`]
    };
  },

  floodTrigger(v) {
    return {
      style: "warn",
      title: "🛑 Anti-spam triggered.",
      lines: [`Too many messages in under ${v.window} — paused for ${v.remaining}.`]
    };
  },

  banned(v) {
    return {
      style: "denied",
      title: "You are banned from this bot.",
      lines: [v.reason ? `Reason: ${v.reason}` : "", "Contact the owner to request a review."].filter(Boolean).join(" — ")
    };
  },

  muted(v) {
    return {
      style: "notice",
      title: "MUTED",
      lines: ["🔇 You are currently muted in this conversation.", `Ends in: ${v.remaining}`, v.reason ? `Reason: ${v.reason}` : ""].filter(Boolean)
    };
  },

  maintenance(v) {
    return {
      style: "warn",
      title: "MAINTENANCE",
      lines: [
        `${v.icon} The bot is under MAINTENANCE.`,
        v.text || "Only administrators can use it right now.",
        "",
        "⚡ Your data is safe; the service returns as soon as maintenance is over."
      ]
    };
  },

  error() {
    return {
      style: "errorBox",
      title: "",
      hint: "Please try again in a few seconds."
    };
  }
};

const TABLES = { fr: FR, en: EN };

/**
 * Récupère le descriptif d'un message système.
 *
 * @param {string} key   clé du message (« unknown », « denied », …)
 * @param {string} [language] « fr » | « en » (sinon français)
 * @param {object} [vars] variables du message
 * @returns {object} descriptif de rendu
 */
function message(key, language, vars = {}) {
  const lang = resolveLanguage(language);
  const table = TABLES[lang] || TABLES[DEFAULT_LANGUAGE];
  const entry = table[key] || TABLES[DEFAULT_LANGUAGE][key];
  if (typeof entry !== "function") {
    return { style: "lightBox", title: "", lines: [String(key)] };
  }
  return entry(vars);
}

/** Variantes d'un message (utilisé pour le « / » seul). */
function variants(key, language, vars = {}) {
  const result = message(key, language, vars);
  return Array.isArray(result) ? result : [result];
}

/**
 * Rend un descriptif en texte Messenger via utils/text.js.
 * Les encadrés « refus » et « erreur » sont entièrement traduits ici.
 */
function render(descriptor, options = {}) {
  if (typeof descriptor === "string") return descriptor;
  const style = String(descriptor.style || "lightBox");
  const lang = resolveLanguage(options.language);
  const ui = UI[lang] || UI[DEFAULT_LANGUAGE];
  const palette = options.palette || text.theme.palette;
  /** Les styles courts (warn/denied) prennent un texte simple, pas un tableau. */
  const detail = Array.isArray(descriptor.lines) ? descriptor.lines.join("\n") : String(descriptor.lines ?? "");

  if (style === "errorBox") {
    return text.darkBox(ui.errorTitle, [ui.errorHeadline, "", descriptor.hint || ui.errorHint, ui.errorFooter]);
  }
  if (style === "warn") return text.warn(descriptor.title || "", detail);
  if (style === "denied") {
    return text.darkBox(ui.deniedTitle, [`⛔ ${descriptor.title || ""}`, detail, "", ui.deniedFooter].filter(Boolean));
  }
  if (style === "notice") return text.notice(descriptor.title || "", descriptor.lines || []);
  if (style === "darkBox") return text.darkBox(descriptor.title || "", descriptor.lines || [], descriptor.footer ? { footer: descriptor.footer } : {});

  const icon = descriptor.icon === "accent" ? palette.accent : descriptor.icon;
  const opts = { ...(descriptor.footer ? { footer: descriptor.footer } : {}) };
  if (icon !== undefined) opts.icon = icon;
  return text.box(descriptor.title || "", descriptor.lines || [], opts);
}

/** Raccourci : descriptif + rendu en une fois. */
function say(key, language, vars = {}, options = {}) {
  return render(message(key, language, vars), { ...options, language });
}

/** Toutes les variantes rendues (messages « bot disponible »). */
function sayVariants(key, language, vars = {}, options = {}) {
  return variants(key, language, vars).map((descriptor) => render(descriptor, { ...options, language }));
}

module.exports = {
  DEFAULT_LANGUAGE,
  SUPPORTED,
  LANGUAGES,
  resolveLanguage,
  fill,
  message,
  variants,
  render,
  say,
  sayVariants
};
