"use strict";

/**
 * /profile — fiche complète : niveau, XP, économie, activité, rôle, badges.
 *   /profile            → ton profil
 *   /profile @quelquun  → le profil d'un autre utilisateur
 *   /profile <uid>      → profil par identifiant
 */

const { box, num, progress, kv, ICONS, mono } = require("../../utils/text");

module.exports = {
  name: "profile",
  aliases: ["profil", "me", "moi", "rankcard"],
  category: "general",
  description: "Affiche ton profil (ou celui d'un autre) : niveau, XP, pièces, activité, rôle.",
  usage: "/profile [@personne|uid]",
  examples: ["/profile", "/profile @quelquun"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx, bag) {
    const { services, permissions, config } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);
    const id = target.id;

    const user = services.users.get(id);
    if (!user) throw new bag.errors.UserError("Profil introuvable.");

    const economy = services.economy.get(id);
    const level = services.xp.progress(user.xp);
    const role = permissions.roleOf(id);
    const roleLabel = permissions.ROLE_LABEL[role] || ICONS.user;
    const name = user.name || target.name || ctx.displayName(id) || id;
    const badges = services.economy.badges(id);
    const rankXp = services.users.rank(id, "xp");
    const rankCoins = services.economy.top(999).findIndex((entry) => entry.userID === id) + 1;

    const lines = [
      kv("Nom", name, ICONS.user),
      kv("Rôle", roleLabel, ICONS.lock),
      kv("UID", mono(id)),
      "",
      kv("Niveau", `${level.level}${level.maxed ? " (maximum)" : ""}`, ICONS.level),
      level.maxed ? "▰▰▰▰▰▰▰▰▰▰ 100%" : progress(level.current, level.needed),
      kv("XP", `${num(level.current)} / ${num(level.needed)}${level.maxed ? "" : ` → niveau ${level.nextLevel}`}`, ICONS.xp),
      "",
      kv("Solde", services.economy.fmt(economy.balance), ICONS.money),
      kv("Inventaire", `${economy.inventory.length} objet(s) • valeur ${services.economy.fmt(services.economy.inventoryValue(id))}`, ICONS.media),
      badges.length ? kv("Badges", badges.map((b) => b.icon).join(" ")) : "",
      "",
      kv("Messages", num(user.messages), ICONS.chart),
      kv("Commandes", num(user.commandsUsed), ICONS.bolt),
      kv("Parties", `${num(user.gamesPlayed)} (${num(user.gamesWon)} gagnées)`, ICONS.game),
      kv("Classement", `#${num(rankXp)} en XP${rankCoins ? ` • #${num(rankCoins)} en ${config.currency.symbol}` : ""}`, ICONS.target),
      user.marriedTo ? kv("Marié(e) à", ctx.displayName(user.marriedTo), ICONS.heart) : "",
      "",
      kv("Membre depuis", new Date(user.joinedAt).toLocaleDateString("fr-FR"), ICONS.info),
      kv("Dernière activité", bag.helpers.formatDuration(Date.now() - user.lastActivity) + " auparavant", ICONS.time)
    ].filter((line) => line !== "");

    return box(`PROFIL — ${String(name).slice(0, 20).toUpperCase()}`, lines, {
      footer: [`${ICONS.book} ${ctx.prefix}leaderboard pour le classement général`]
    });
  }
};
