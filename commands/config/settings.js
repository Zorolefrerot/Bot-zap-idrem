"use strict";

/**
 * /settings — réglages de CE groupe (chaque conversation est indépendante).
 *
 *   /settings                    → tous les réglages du groupe
 *   /settings <clé>              → détail d'un réglage
 *   /settings <clé> <valeur>     → modification (admins du groupe)
 *   /settings keys               → clés disponibles
 *
 * Clés : prefix, welcome, goodbye, welcomeMsg, goodbyeMsg, antilink, antispam,
 * language, notifications, games, conversation, rules, allowedLinkDomains.
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "settings",
  aliases: ["config-groupe", "reglages", "réglages", "parametres", "paramètres"],
  category: "config",
  description: "Affiche et modifie les réglages du groupe (indépendants des autres groupes).",
  usage: "/settings [clé] [valeur]",
  examples: ["/settings", "/settings antilink on", "/settings language en", "/settings prefix !"],
  permissions: "groupadmin",
  cooldown: 6,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services, permissions } = bag;
    const schema = services.settings.schema();
    const settings = services.settings.get(ctx.threadID);
    const key = String(ctx.args[0] || "").trim();
    const value = ctx.args.slice(1).join(" ").trim();

    // --- Clés disponibles ----------------------------------------------------
    if (key === "keys" || key === "clés" || key === "cles" || key === "liste") {
      return box("RÉGLAGES DISPONIBLES", [
        `${ICONS.gear} ${num(Object.keys(schema).length)} réglages par groupe :`,
        "",
        ...Object.entries(schema).map(([name, entry]) => `${entry.icon || "•"} ${cmd(name, ctx.prefix)} — ${entry.description}`),
        "",
        `${ICONS.info} ${cmd("settings <clé> <valeur>", ctx.prefix)} pour modifier.`
      ]);
    }

    // --- Vue complète --------------------------------------------------------
    if (!key) {
      const bool = (v) => (v ? `${ICONS.ok} activé` : `${ICONS.no} désactivé`);
      return box(`RÉGLAGES — ${String(ctx.threadName || "CE GROUPE").slice(0, 24).toUpperCase()}`, [
        `${ICONS.gear} Chaque groupe a ses propres réglages, indépendants des autres.`,
        "",
        `🔤 Préfixe : ${ctx.prefix}${settings.prefix ? " (propre au groupe)" : " (hérité du global)"}`,
        `👋 Bienvenue : ${bool(settings.welcome)}`,
        `🚪 Au revoir : ${bool(settings.goodbye)}`,
        `🔗 Anti-lien : ${bool(settings.antilink)}${settings.allowedLinkDomains.length ? ` — ${settings.allowedLinkDomains.join(", ")}` : ""}`,
        `🛡️ Anti-spam : ${bool(settings.antispam)}`,
        `🌍 Langue : ${settings.language}`,
        `🔔 Notifications : ${bool(settings.notifications)}`,
        `🎮 Jeux : ${bool(settings.games)}`,
        `💬 Conversation : ${bool(settings.conversation)}`,
        `📜 Règles : ${settings.rules ? `${num(settings.rules.length)} caractères` : "par défaut"}`,
        "",
        `${ICONS.pin} ${cmd("settings <clé>", ctx.prefix)} pour le détail d'un réglage`,
        `${ICONS.pin} ${cmd("settings keys", ctx.prefix)} pour la liste complète`
      ]);
    }

    if (!(key in schema)) {
      const close = Object.keys(schema).filter((name) => name.startsWith(key.slice(0, 3)));
      return lightBox("RÉGLAGES", [
        `${ICONS.warn} Réglage inconnu : « ${key.slice(0, 24)} ».`,
        "",
        close.length ? `${ICONS.pin} Peut-être : ${close.map((name) => cmd(name, ctx.prefix)).join(" • ")}` : `${ICONS.pin} ${cmd("settings keys", ctx.prefix)} pour la liste.`
      ]);
    }

    // --- Détail d'un réglage -------------------------------------------------
    const entry = schema[key];
    if (!value) {
      const current = settings[key];
      const display = Array.isArray(current) ? current.join(", ") || "(vide)" : typeof current === "boolean" ? (current ? "activé" : "désactivé") : String(current).slice(0, 300) || "(vide)";
      return box(entry.label.toUpperCase(), [
        `${entry.icon || ICONS.gear} Clé : ${cmd(key, ctx.prefix)}`,
        `${ICONS.pin} Valeur actuelle : ${display}`,
        `${ICONS.info} ${entry.description}`,
        "",
        entry.type === "boolean" ? `${ICONS.gear} ${cmd(`settings ${key} on|off`, ctx.prefix)}` : "",
        entry.type === "enum" ? `${ICONS.gear} Valeurs : ${entry.values.join(" / ")} → ${cmd(`settings ${key} ${entry.values[0]}`, ctx.prefix)}` : "",
        entry.type === "string" ? `${ICONS.gear} ${cmd(`settings ${key} <texte>`, ctx.prefix)} (max ${num(entry.max || 400)} caractères)` : "",
        entry.type === "array" ? `${ICONS.gear} ${cmd(`settings ${key} exemple.com autre.com`, ctx.prefix)} (max ${num(entry.max || 30)} domaines)` : ""
      ].filter((line) => line !== ""));
    }

    // --- Modification --------------------------------------------------------
    if (!permissions.isGroupAdmin(ctx.senderID, ctx.groupAdminIDs)) {
      return bag.text.denied("groupadmin", "Seuls les administrateurs du groupe modifient ses réglages.");
    }

    const result = services.settings.set(ctx.threadID, key, value, { by: ctx.senderID });
    if (!result.ok) {
      return lightBox("RÉGLAGES", [`${ICONS.no} ${result.error}`, "", `${ICONS.info} ${entry.description}`, `${ICONS.pin} ${cmd(`settings ${key}`, ctx.prefix)} pour la valeur actuelle.`]);
    }

    bag.logs.info("settings", `${key} = ${JSON.stringify(result.value)} (${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "settings" });
    const display = Array.isArray(result.value) ? result.value.join(", ") : typeof result.value === "boolean" ? (result.value ? "activé" : "désactivé") : String(result.value).slice(0, 120);

    return box("RÉGLAGE MIS À JOUR", [
      `${ICONS.ok} ${entry.label} : ${display}`,
      "",
      `${ICONS.group} Portée : ${ctx.threadName || "ce groupe"} uniquement.`,
      key === "prefix" ? `${ICONS.info} Nouveau préfixe actif : ${cmd("settings", result.value || ctx.prefix)}` : "",
      key === "language" ? `${ICONS.info} Les messages système du bot sont maintenant dans cette langue.` : ""
    ].filter((line) => line !== ""));
  }
};
