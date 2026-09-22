"use strict";

/**
 * /mystats — statistiques personnelles (ou celles d'une cible explicite).
 *   /mystats              → mes chiffres
 *   /mystats @quelquun    → les chiffres de cette personne
 */

const { box, cmd, num, progress, ICONS } = require("../../utils/text");
const { formatDuration } = require("../../utils/helpers");

module.exports = {
  name: "mystats",
  aliases: ["messtats", "mystatistics", "mes-stats"],
  category: "stats",
  description: "Tes statistiques personnelles : XP, niveau, messages, commandes, jeux, classements.",
  usage: "/mystats [@personne]",
  examples: ["/mystats", "/mystats @quelquun"],
  permissions: "public",
  cooldown: 6,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);
    const user = services.users.get(target.id);
    const isSelf = target.id === ctx.senderID;
    const name = isSelf ? "toi" : target.name || ctx.displayName(target.id);

    const nextLevel = services.xp.xpForLevel(user.level + 1);
    const currentLevel = services.xp.xpForLevel(user.level);
    const rankXp = services.users.rank(target.id, "xp");
    const rankMessages = services.users.rank(target.id, "messages");
    const rankCommands = services.users.rank(target.id, "commandsUsed");
    const winRate = user.gamesPlayed > 0 ? Math.round((user.gamesWon / user.gamesPlayed) * 100) : 0;

    const favourite = Object.entries(user.commandCounts || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([commandName, count]) => `${commandName} (${num(count)})`);

    return box(`STATS — ${String(isSelf ? "TOI" : name).slice(0, 20).toUpperCase()}`, [
      `${ICONS.user} ${user.name || name} • rôle ${user.role}`,
      `${ICONS.level} Niveau ${num(user.level)} • ${ICONS.xp} ${num(user.xp)} XP`,
      progress(Math.max(0, user.xp - currentLevel), Math.max(1, nextLevel - currentLevel)),
      `${ICONS.pin} Avant le niveau ${num(user.level + 1)} : ${num(Math.max(0, nextLevel - user.xp))} XP`,
      "",
      `${ICONS.chart} Messages : ${num(user.messages)}`,
      `${ICONS.bolt} Commandes : ${num(user.commandsUsed)}`,
      `${ICONS.game} Parties : ${num(user.gamesPlayed)} • victoires ${num(user.gamesWon)} (${num(winRate)} %)`,
      `${ICONS.money} Solde : ${num(services.economy.balance(target.id))} ${config.currency.symbol}`,
      "",
      `${ICONS.target} Classements : XP ${num(rankXp)}${rankXp ? `/${num(services.users.count())}` : ""} • messages ${num(rankMessages)} • commandes ${num(rankCommands)}`,
      favourite.length ? `${ICONS.fire} Commandes favorites : ${favourite.join(", ")}` : `${ICONS.info} Aucune commande favorite pour l'instant.`,
      "",
      `${ICONS.time} Inscrit depuis : ${formatDuration(Date.now() - user.joinedAt)}`,
      `${ICONS.time} Dernière activité : ${user.lastActivity ? formatDuration(Date.now() - user.lastActivity) : "inconnue"}`,
      "",
      `${ICONS.info} Profil complet : ${cmd("profile", ctx.prefix)} • Classement : ${cmd("leaderboard", ctx.prefix)}`
    ]);
  }
};
