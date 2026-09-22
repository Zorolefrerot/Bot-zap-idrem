"use strict";

/**
 * /groups — conversations et groupes connus du bot (administrateurs).
 *   /groups               → liste des groupes + activité
 *   /groups <nombre>      → top N
 *   /groups search <mot>  → recherche par nom
 *   /groups <threadID>    → fiche détaillée (réglages inclus)
 *   /groups settings      → groupes ayant des réglages personnalisés
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { formatDuration } = require("../../utils/helpers");

module.exports = {
  name: "groups",
  aliases: ["groupes", "threads", "conversations", "groupelist"],
  category: "stats",
  description: "Liste les groupes et conversations connus du bot, avec leurs réglages.",
  usage: "/groups [nombre|search <mot>|settings|<threadID>]",
  examples: ["/groups", "/groups 25", "/groups search projet", "/groups settings"],
  permissions: "admin",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services, permissions } = bag;
    const args = ctx.args.map((a) => String(a).trim());
    const first = String(args[0] || "").toLowerCase();
    const all = services.groups.all();
    const groups = all.filter((entry) => entry.isGroup);
    const privates = all.filter((entry) => !entry.isGroup);

    // --- Groupes avec réglages personnalisés ---------------------------------
    if (first === "settings" || first === "reglages" || first === "réglages") {
      const configured = groups.filter((entry) => {
        const settings = services.settings.get(entry.threadID);
        const defaults = services.settings.defaults();
        return Object.keys(defaults).some((key) => JSON.stringify(settings[key]) !== JSON.stringify(defaults[key]));
      });

      return box("GROUPES CONFIGURÉS", [
        `${ICONS.gear} ${num(configured.length)} groupe(s) sur ${num(groups.length)} ont des réglages personnalisés`,
        `${ICONS.pin} ${num(services.settings.count())} jeu(x) de réglages enregistré(s)`,
        "",
        ...(configured.length
          ? configured.slice(0, 15).map((entry) => {
              const settings = services.settings.get(entry.threadID);
              const flags = [
                settings.prefix ? `préfixe « ${settings.prefix} »` : "",
                settings.welcome ? "bienvenue" : "",
                settings.goodbye ? "au revoir" : "",
                settings.antilink ? "antilink" : "",
                settings.antispam === false ? "antispam off" : "",
                settings.language !== "fr" ? `langue ${settings.language}` : "",
                settings.conversation === false ? "conversation off" : ""
              ].filter(Boolean);
              return `• ${String(entry.name || entry.threadID).slice(0, 22)} — ${flags.length ? flags.join(", ") : "réglages modifiés"}`;
            })
          : [`${ICONS.info} Tous les groupes utilisent les réglages par défaut.`]),
        configured.length > 15 ? `… ${num(configured.length - 15)} autre(s).` : "",
        "",
        `${ICONS.info} Chaque groupe est strictement indépendant des autres.`
      ].filter((line) => line !== ""));
    }

    // --- Recherche par nom ---------------------------------------------------
    if (first === "search" || first === "recherche" || first === "find") {
      const needle = args.slice(1).join(" ").trim().toLowerCase();
      if (!needle) return lightBox("GROUPES", [`${ICONS.warn} Précise un nom à chercher.`, "", cmd("groups search <nom>", ctx.prefix)]);

      const found = all.filter((entry) => String(entry.name || "").toLowerCase().includes(needle) || String(entry.threadID).includes(needle));
      if (!found.length) return lightBox("GROUPES", [`${ICONS.warn} Aucune conversation ne correspond à « ${needle.slice(0, 24)} ».`]);

      return box(`RECHERCHE — ${needle.slice(0, 20).toUpperCase()}`, [
        `${ICONS.chart} ${num(found.length)} résultat(s)`,
        "",
        ...found.slice(0, 15).map((entry) => `${entry.isGroup ? ICONS.group : ICONS.user} ${String(entry.name || entry.threadID).slice(0, 24)} — ${num(entry.messages)} msg • ${entry.threadID}`),
        found.length > 15 ? `… ${num(found.length - 15)} autre(s).` : "",
        "",
        `${ICONS.info} Fiche détaillée : ${cmd("groups <threadID>", ctx.prefix)}`
      ].filter((line) => line !== ""));
    }

    // --- Fiche d'une conversation -------------------------------------------
    const threadID = /^\d{5,25}$/.test(first) ? first : "";
    if (threadID) {
      const entry = services.groups.get(threadID);
      if (!entry || (!entry.name && !entry.messages)) {
        return lightBox("CONVERSATION", [`${ICONS.warn} Aucune conversation connue pour l'identifiant ${threadID}.`]);
      }
      const settings = services.settings.get(threadID);
      const info = await services.groups.threadInfo(threadID);
      const bool = (value) => (value ? `${ICONS.ok}` : `${ICONS.no}`);

      return box(`CONVERSATION — ${String(entry.name || threadID).slice(0, 20).toUpperCase()}`, [
        `${entry.isGroup ? ICONS.group : ICONS.user} ${entry.name || "(sans nom)"} • ${entry.isGroup ? "groupe" : "conversation privée"}`,
        `${ICONS.pin} ID : ${threadID}`,
        `${ICONS.chart} Membres : ${num(entry.memberCount)} • Admins : ${num((entry.admins || []).length)}`,
        `${ICONS.bolt} Messages : ${num(entry.messages)} • Commandes : ${num(entry.commandsUsed)}`,
        `${ICONS.time} Dernière activité : ${formatDuration(Date.now() - entry.lastActivity)}`,
        "",
        `${ICONS.gear} Réglages :`,
        `   préfixe ${settings.prefix || "(global)"} • langue ${settings.language}`,
        `   ${bool(settings.welcome)} bienvenue • ${bool(settings.goodbye)} au revoir`,
        `   ${bool(settings.antilink)} antilink • ${bool(settings.antispam)} antispam`,
        `   ${bool(settings.games)} jeux • ${bool(settings.conversation)} conversation`,
        "",
        info.ok ? `${ICONS.plug} Vérification Facebook : ${num(info.memberCount)} membre(s)${info.cached ? " (cache)" : " (temps réel)"}` : `${ICONS.warn} Vérification Facebook indisponible : ${info.error}`,
        "",
        `${ICONS.info} Réinitialiser : ${cmd(`reset settings`, ctx.prefix)} (depuis ce groupe)`
      ]);
    }

    // --- Liste globale -------------------------------------------------------
    const limit = Math.max(1, Math.min(50, Number(first) || 15));
    const top = services.groups.top(limit);
    const summary = services.stats.summary();

    if (!all.length) {
      return lightBox("GROUPES", [`${ICONS.info} Aucune conversation enregistrée pour l'instant.`]);
    }

    const moderation = services.warnings.stats();
    return box("GROUPES & CONVERSATIONS", [
      `${ICONS.group} ${num(groups.length)} groupe(s) • ${ICONS.user} ${num(privates.length)} conversation(s) privée(s)`,
      `${ICONS.chart} ${num(summary.trackedThreads)} conversation(s) active(s) depuis le démarrage`,
      `${ICONS.gear} ${num(services.settings.count())} groupe(s) avec réglages`,
      `${ICONS.no} Modération : ${num(moderation.bans)} ban • ${num(moderation.warns)} warn • ${num(moderation.kicks)} kick`,
      "",
      `${ICONS.pin} Les plus actifs :`,
      ...top.map((entry, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${String(index + 1).padStart(2, " ")}.`;
        return `${medal} ${entry.isGroup ? ICONS.group : ICONS.user} ${String(entry.name || entry.threadID).slice(0, 22)} — ${num(entry.messages)} msg • ${num(entry.commandsUsed)} cmd`;
      }),
      all.length > top.length ? `… ${num(all.length - top.length)} autre(s).` : "",
      "",
      `${ICONS.info} ${cmd("groups search <nom>", ctx.prefix)} • ${cmd("groups <threadID>", ctx.prefix)} • ${cmd("groups settings", ctx.prefix)}`,
      permissions.isOwner(ctx.senderID) ? `${ICONS.warn} Effacement total : ${cmd("reset data --force", ctx.prefix)}` : ""
    ].filter((line) => line !== ""));
  }
};
