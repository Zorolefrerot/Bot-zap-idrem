"use strict";

/**
 * /rank — fiche de classement compacte (niveau + position).
 */

const { box, num, progress, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "rank",
  aliases: ["level", "niveau", "xpcard", "carteniveau"],
  category: "social",
  description: "Affiche le niveau, l'XP et la position au classement d'un utilisateur.",
  usage: "/rank [@personne|uid]",
  examples: ["/rank", "/rank @quelquun"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);
    const user = services.users.get(target.id);
    const level = services.xp.progress(user.xp);
    const name = user.name || target.name || ctx.displayName(target.id);

    const rankXp = services.users.rank(target.id, "xp");
    const rankMessages = services.users.rank(target.id, "messages");
    const economy = services.economy.get(target.id);
    const rankCoins = services.economy.top(9999).findIndex((entry) => entry.userID === target.id) + 1;

    return box(
      `RANK — ${String(name).slice(0, 18).toUpperCase()}`,
      [
        `${ICONS.level} Niveau ${num(level.level)}${level.maxed ? " (maximum)" : ""}`,
        level.maxed ? "▰▰▰▰▰▰▰▰▰▰ 100%" : progress(level.current, level.needed),
        `${ICONS.xp} ${num(level.total)} XP cumulés${level.maxed ? "" : ` — encore ${num(level.needed - level.current)} XP pour le niveau ${level.nextLevel}`}`,
        "",
        `${ICONS.target} #${num(rankXp)} en XP • #${num(rankMessages)} en messages${rankCoins ? ` • #${num(rankCoins)} en ${config.currency.symbol}` : ""}`,
        `${ICONS.money} ${services.economy.fmt(economy.balance)}`,
        `${ICONS.game} ${num(user.gamesWon)} victoire(s) sur ${num(user.gamesPlayed)} partie(s)`
      ],
      { footer: [`${cmd("leaderboard", ctx.prefix)} pour le classement complet`] }
    );
  }
};
