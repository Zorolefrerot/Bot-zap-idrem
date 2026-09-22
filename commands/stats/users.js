"use strict";

/**
 * /users — gestion des utilisateurs du bot (administrateurs).
 *   /users                    → aperçu + 15 premiers profils
 *   /users <nombre>           → top N
 *   /users search <mot>       → recherche par nom
 *   /users <uid>              → fiche détaillée d'un utilisateur
 *   /users admins             → administrateurs déclarés
 *   /users role <uid> <rôle>  → change un rôle (PROPRIÉTAIRE uniquement)
 *
 * Promotion impossible pour soi-même, et jamais vers « owner ».
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { formatDuration } = require("../../utils/helpers");
const { record, uid } = require("../../utils/moderation");

const ROLES = ["user", "admin"];

module.exports = {
  name: "users",
  aliases: ["userlist", "utilisateurs", "profiles"],
  category: "stats",
  description: "Liste, recherche et gère les utilisateurs du bot (rôles réservés au propriétaire).",
  usage: "/users [nombre|search <mot>|<uid>|admins|role <uid> <rôle>]",
  examples: ["/users", "/users 25", "/users search merdi", "/users admins", "/users role 100012345678901 admin"],
  permissions: "admin",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services, permissions, config } = bag;
    const args = ctx.args.map((a) => String(a).trim());
    const first = String(args[0] || "").toLowerCase();

    // --- Gestion des rôles ---------------------------------------------------
    if (first === "role" || first === "setrole" || first === "promote" || first === "demote") {
      if (!permissions.isOwner(ctx.senderID)) {
        return bag.text.denied("owner", "Seul le propriétaire du bot peut attribuer un rôle.");
      }
      const targetID = uid(args[1]);
      const role = String(args[2] || "").toLowerCase();
      if (!targetID) return lightBox("RÔLE", [`${ICONS.warn} Indique un UID valide.`, "", cmd("users role <uid> admin", ctx.prefix)]);
      if (!ROLES.includes(role)) {
        return lightBox("RÔLE", [
          `${ICONS.warn} Rôle invalide : « ${role.slice(0, 12)} ».`,
          "",
          `${ICONS.pin} Rôles attribuables : ${ROLES.join(" / ")}`,
          `${ICONS.lock} Le rôle « owner » n'est jamais attribuable : il vient de OWNER_UID (${config.owner.uid}).`,
          `${ICONS.info} Personne ne peut s'auto-promouvoir, y compris via cette commande.`
        ]);
      }
      if (targetID === ctx.senderID) {
        return lightBox("RÔLE", [`${ICONS.no} Tu ne peux pas modifier ton propre rôle (protection anti-escalade).`]);
      }
      if (targetID === config.owner.uid) {
        return lightBox("RÔLE", [`${ICONS.no} Le rôle du propriétaire est fixé par la configuration.`]);
      }

      const before = services.users.roleOf(targetID);
      const result = services.users.setRole(targetID, role, { by: ctx.senderID });
      if (result && result.ok === false) return lightBox("RÔLE", [`${ICONS.no} ${result.error || "Changement impossible."}`]);

      record(bag, ctx, "setrole", `${targetID} : ${before} → ${role}`);
      await bag.sendTo(targetID, `${role === "admin" ? "🛡️ Tu es maintenant administrateur" : "👤 Tu redeviens utilisateur standard"} de ${config.identity.name}.`);

      return box("RÔLE MODIFIÉ", [
        `${ICONS.ok} ${services.users.getName(targetID) || targetID} : ${before} → ${role}`,
        `${ICONS.user} UID : ${targetID}`,
        "",
        role === "admin"
          ? `${ICONS.info} Un administrateur accède aux commandes de modération et échappe au cooldown global.`
          : `${ICONS.info} Les commandes d'administration ne lui sont plus accessibles.`,
        `${ICONS.lock} Le rôle « owner » reste impossible à attribuer.`
      ]);
    }

    // --- Administrateurs déclarés -------------------------------------------
    if (first === "admins" || first === "administrateurs") {
      const admins = services.users.admins();
      const ownerUID = permissions.getOwnerUID();
      return box("ADMINISTRATEURS", [
        `${ICONS.crown} Propriétaire : ${ownerUID || "non configuré"}${services.users.getName(ownerUID) ? ` (${services.users.getName(ownerUID)})` : ""}`,
        `${ICONS.gear} Admins déclarés : ${num(admins.length)}`,
        "",
        ...(admins.length
          ? admins.slice(0, 20).map((user) => `🛡️ ${String(user.name || user.userID).slice(0, 24)} — ${user.userID}`)
          : [`${ICONS.info} Aucun administrateur déclaré.`]),
        "",
        `${ICONS.pin} Attribuer : ${cmd("users role <uid> admin", ctx.prefix)} (propriétaire)`,
        `${ICONS.lock} Aucun utilisateur ne peut s'auto-promouvoir.`
      ]);
    }

    // --- Recherche par nom ---------------------------------------------------
    if (first === "search" || first === "recherche" || first === "find") {
      const needle = args.slice(1).join(" ").trim().toLowerCase();
      if (!needle) return lightBox("UTILISATEURS", [`${ICONS.warn} Précise un nom à chercher.`, "", cmd("users search <nom>", ctx.prefix)]);

      const found = services.users.all().filter((user) => String(user.name || "").toLowerCase().includes(needle) || String(user.userID).includes(needle));
      if (!found.length) return lightBox("UTILISATEURS", [`${ICONS.warn} Aucun profil ne correspond à « ${needle.slice(0, 24)} ».`, "", `${ICONS.info} Seuls les utilisateurs déjà croisés par le bot sont enregistrés.`]);

      return box(`RECHERCHE — ${needle.slice(0, 20).toUpperCase()}`, [
        `${ICONS.chart} ${num(found.length)} profil(s)`,
        "",
        ...found.slice(0, 15).map((user) => `• ${String(user.name || user.userID).slice(0, 24)} — niveau ${num(user.level)} • ${num(user.messages)} msg • ${user.userID}`),
        found.length > 15 ? `… ${num(found.length - 15)} autre(s).` : "",
        "",
        `${ICONS.info} Fiche détaillée : ${cmd("users <uid>", ctx.prefix)}`
      ].filter((line) => line !== ""));
    }

    // --- Fiche d'un utilisateur ---------------------------------------------
    const single = uid(first);
    if (single) {
      const user = services.users.peek(single);
      if (!user) {
        return lightBox("UTILISATEUR", [
          `${ICONS.warn} Aucun profil enregistré pour ${single}.`,
          "",
          `${ICONS.info} Un profil est créé à la première interaction avec le bot.`
        ]);
      }
      const warnings = services.warnings.bannedList().find((entry) => entry.userID === single);
      return box(`PROFIL — ${String(user.name || single).slice(0, 20).toUpperCase()}`, [
        `${ICONS.user} ${user.name || "(nom inconnu)"} • rôle ${user.role}`,
        `${ICONS.pin} UID : ${single}`,
        `${ICONS.level} Niveau ${num(user.level)} • ${ICONS.xp} ${num(user.xp)} XP`,
        `${ICONS.money} Solde : ${num(services.economy.balance(single))} ${config.currency.symbol}`,
        `${ICONS.chart} Messages : ${num(user.messages)} • Commandes : ${num(user.commandsUsed)}`,
        `${ICONS.game} Parties : ${num(user.gamesPlayed)} • victoires ${num(user.gamesWon)}`,
        user.marriedTo ? `💍 Marié(e) à : ${services.users.getName(user.marriedTo) || user.marriedTo}` : "",
        `${ICONS.social} Amis : ${num((user.friends || []).length)}`,
        "",
        `${ICONS.time} Inscrit depuis : ${formatDuration(Date.now() - user.joinedAt)}`,
        `${ICONS.time} Dernière activité : ${formatDuration(Date.now() - user.lastActivity)}`,
        warnings ? `${ICONS.no} Banni : ${warnings.reason || "sans motif"} (le ${new Date(warnings.at).toLocaleDateString("fr-FR")})` : `${ICONS.ok} Aucun bannissement.`,
        "",
        `${ICONS.pin} ${cmd(`users role ${single} admin`, ctx.prefix)} • ${cmd(`ban ${single}`, ctx.prefix)} • ${cmd(`warnings ${single}`, ctx.prefix)}`
      ].filter((line) => line !== ""));
    }

    // --- Liste globale -------------------------------------------------------
    const limit = Math.max(1, Math.min(50, Number(first) || 15));
    const all = services.users.all();
    const top = services.users.top("xp", limit);
    const summary = services.stats.summary();

    if (!all.length) {
      return lightBox("UTILISATEURS", [`${ICONS.info} Aucun utilisateur enregistré pour l'instant.`]);
    }

    return box("UTILISATEURS", [
      `${ICONS.user} ${num(all.length)} profil(s) enregistré(s) • ${num(summary.trackedUsers)} actif(s)`,
      `${ICONS.crown} Rôles : ${num(services.users.admins().length)} admin(s) • ${permissions.getOwnerUID() ? "1 owner" : "owner non configuré"}`,
      `${ICONS.no} Bannis : ${num(services.warnings.bannedList().length)}`,
      "",
      `${ICONS.pin} Top ${num(Math.min(limit, top.length))} par XP :`,
      ...top.map((user, index) => `${String(index + 1).padStart(2, " ")}. ${String(user.name || user.userID).slice(0, 22)} — niveau ${num(user.level)} • ${num(user.xp)} XP • ${num(user.messages)} msg`),
      all.length > top.length ? `… ${num(all.length - top.length)} autre(s).` : "",
      "",
      `${ICONS.info} ${cmd("users search <nom>", ctx.prefix)} • ${cmd("users <uid>", ctx.prefix)} • ${cmd("users admins", ctx.prefix)}`
    ].filter((line) => line !== ""));
  }
};
