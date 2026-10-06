'use strict';
/*
 * 🧬 MeR~NeL — commands/economy/xcoins.js
 * Solde de XCoins du membre.
 */

module.exports = {
  name: 'xcoins',
  description: 'Affiche ton solde de XCoins',
  usage: 'Xcoins',
  category: 'economy',
  aliases: ['xbalance', 'xcoin'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    const user = ctx.economy.ensureUser(ctx.senderID);
    const position = ctx.economy.positionOf(ctx.senderID);
    await ctx.send(
      ctx.fmt.frame('💰 𝗫𝗖𝗢𝗜𝗡𝗦', [
        `👤 ${ctx.fmt.bold(user.nickname || user.name || ctx.senderName)}`,
        '',
        `💰 ${ctx.fmt.bold('𝗫𝗖𝗼𝗶𝗻𝘀')} : ${ctx.fmt.boldNum(user.xcoins)}`,
        position ? `📊 ${ctx.fmt.bold('Rang')} : ${ctx.fmt.boldNum(position)}` : '',
        `⭐ ${ctx.fmt.bold('Niveau')} : ${ctx.fmt.boldNum(user.level)}`,
      ].filter(Boolean))
    );
  },
};
