"use strict";

/**
 * /broadcast — diffusion d'un message du propriétaire.
 *
 *   /broadcast <message>              → tous les groupes connus
 *   /broadcast --users <message>      → tous les utilisateurs connus (MP)
 *   /broadcast --all <message>        → groupes + utilisateurs
 *   /broadcast --admins <message>     → administrateurs uniquement
 *   /broadcast --test <message>       → aperçu (aucun envoi réel)
 *
 * Envois espacés pour ne jamais saturer Messenger (anti-spam côté bot).
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { sleep } = require("../../utils/helpers");
const { record } = require("../../utils/moderation");

const FLAGS = ["--users", "--all", "--admins", "--test", "--groups"];
const DELAY_MS = 1200;
const MAX_DESTINATIONS = 200;

module.exports = {
  name: "broadcast",
  aliases: ["bc", "annonce", "diffusion", "annoncer"],
  category: "admin",
  description: "Diffuse un message aux groupes, aux utilisateurs ou aux administrateurs.",
  usage: "/broadcast [--users|--all|--admins|--test] <message>",
  examples: ["/broadcast Maintenance prévue à 20 h.", "/broadcast --test Bonjour !", "/broadcast --admins Réunion"],
  permissions: "owner",
  cooldown: 60,
  typing: true,

  async execute(ctx, bag) {
    const { services, permissions, logger } = bag;

    const flags = ctx.args.filter((arg) => FLAGS.includes(String(arg).toLowerCase()));
    const message = ctx.args
      .filter((arg) => !FLAGS.includes(String(arg).toLowerCase()))
      .join(" ")
      .trim();

    if (!message) {
      return lightBox("DIFFUSION", [
        `${ICONS.warn} Aucun message à diffuser.`,
        "",
        `${ICONS.pin} ${cmd("broadcast <message>", ctx.prefix)}`,
        `${ICONS.pin} ${cmd("broadcast --test <message>", ctx.prefix)} → aperçu sans envoi`,
        `${ICONS.pin} Cibles : --groups (défaut), --users, --all, --admins`
      ]);
    }
    if (message.length > 1500) return lightBox("DIFFUSION", [`${ICONS.warn} Message trop long (1 500 caractères maximum).`]);

    const wantsUsers = flags.includes("--users") || flags.includes("--all");
    const wantsAdmins = flags.includes("--admins");
    const dryRun = flags.includes("--test");
    const wantsGroups = !wantsUsers || flags.includes("--groups") || flags.includes("--all");

    const body = `📢 ${services.settings.status().icon} ${message}\n\n⚡ ${bag.config.identity.name}`;

    // --- Construction des destinations --------------------------------------
    const threadIDs = wantsGroups
      ? services.groups.all().filter((g) => g && g.isGroup && g.threadID).map((g) => g.threadID)
      : [];
    const userIDs = wantsUsers
      ? services.users.all().filter((u) => u && u.userID).map((u) => u.userID)
      : wantsAdmins
        ? permissions.getAdminUIDs()
        : [];

    const destinations = [...new Set([...threadIDs, ...userIDs])].filter(Boolean);
    if (!destinations.length) {
      return lightBox("DIFFUSION", [
        `${ICONS.warn} Aucune destination connue.`,
        "",
        `${ICONS.info} Le bot diffuse vers les conversations déjà croisées (elles sont enregistrées à la première interaction).`,
        `${ICONS.pin} Groupes suivis : ${num(services.groups.groupCount())} • Utilisateurs : ${num(services.users.count())}`
      ]);
    }

    if (dryRun) {
      return box("APERÇU — AUCUN ENVOI", [
        `${ICONS.target} Destinations : ${num(Math.min(destinations.length, MAX_DESTINATIONS))} (${num(threadIDs.length)} groupe(s), ${num(userIDs.length)} utilisateur(s))`,
        "",
        body,
        "",
        `${ICONS.time} Durée estimée : ${Math.ceil(Math.min(destinations.length, MAX_DESTINATIONS) * (DELAY_MS / 1000) / 60)} min (envois espacés de ${DELAY_MS / 1000} s)`,
        `${ICONS.info} Retire --test pour diffuser réellement.`
      ]);
    }

    if (destinations.length > MAX_DESTINATIONS) {
      return lightBox("DIFFUSION", [
        `${ICONS.warn} ${num(destinations.length)} destinations : au-delà de ${num(MAX_DESTINATIONS)}, la diffusion est refusée (protection anti-blocage Facebook).`,
        "",
        `${ICONS.pin} Utilise ${cmd("broadcast --admins <message>", ctx.prefix)} pour une diffusion restreinte.`
      ]);
    }

    // --- Envoi réel, espacé --------------------------------------------------
    let sent = 0;
    let failed = 0;
    for (const destination of destinations) {
      const okSend = await bag.sendTo(destination, body);
      if (okSend) sent += 1;
      else failed += 1;
      await sleep(DELAY_MS);
    }

    record(bag, ctx, "broadcast", `${sent} envoi(s), ${failed} échec(s)`);
    logger.info(`Diffusion : ${sent} réussi(s), ${failed} échec(s) sur ${destinations.length}.`, "admin");

    return box("DIFFUSION TERMINÉE", [
      `${sent ? ICONS.ok : ICONS.warn} Envoyé à ${num(sent)} conversation(s)${failed ? ` • ${num(failed)} échec(s)` : ""}.`,
      "",
      body,
      "",
      `${ICONS.info} Les échecs viennent généralement de conversations fermées ou d'un débit limité par Messenger.`
    ]);
  }
};
