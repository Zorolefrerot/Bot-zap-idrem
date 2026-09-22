'use strict';
/*
 * 🧬 MeR~NeL — commands/economy/xrank.js
 * Classement des membres par XCoins + position du demandeur.
 */

module.exports = {
  name: 'xrank',
  description: 'Classement des plus riches en XCoins',
  usage: 'Xrank',
  category: 'economy',
  aliases: ['xleaderboard', 'xlb'],
  adminOnly: false,
  cooldownMs: 4000,
  run: async (ctx) => {
    const top = ctx.economy.leaderboard(10);
    if (top.length === 0) {
      return ctx.send(ctx.fmt.frame('🏆 𝗫𝗥𝗔𝗡𝗞', '📭 ' + ctx.fmt.bold('Aucun membre enregistré pour le moment.')));
    }
    const medals = ['🥇', '🥈', '🥉'];
    const lines = [];
    for (let i = 0; i < top.length; i++) {
      const u = top[i];
      const icon = i < 3 ? medals[i] : `▸`;
      const name = u.nickname || u.name || `Membre ${ctx.fmt.boldNum(i + 1)}`;
      lines.push(`${icon} ${ctx.fmt.bold(name)} — ${ctx.fmt.boldNum(u.xcoins)} ${ctx.fmt.bold('XCoins')}`);
    }
    const position = ctx.economy.positionOf(ctx.senderID);
    const me = ctx.economy.ensureUser(ctx.senderID);
    lines.push(
      '',
      ctx.fmt.separator(),
      `📍 ${ctx.fmt.bold('Ta position')} : ${ctx.fmt.boldNum(position || '?')} — ${ctx.fmt.boldNum(me.xcoins)} ${ctx.fmt.bold('XCoins')}`
    );
    await ctx.send(ctx.fmt.frame('🏆 𝗫𝗥𝗔𝗡𝗞 — 𝗫𝗖𝗢𝗜𝗡𝗦', lines));
  },
};
