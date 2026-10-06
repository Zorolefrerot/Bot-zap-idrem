'use strict';
/*
 * 🧬 MeR~NeL — commands/economy/xp.js
 * Expérience & niveau du membre.
 */

const { thresholdForLevel } = require('../../systems/xp');

module.exports = {
  name: 'xp',
  description: 'Affiche ton XP et ton niveau',
  usage: 'Xp',
  category: 'economy',
  aliases: ['xxp', 'xlevel'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    const info = ctx.xp.info(ctx.senderID);
    const user = ctx.economy.ensureUser(ctx.senderID);
    const bar = ctx.fmt.progressBar(info.intoLevel, info.needed, 12);
    await ctx.send(
      ctx.fmt.frame('⭐ 𝗫𝗣', [
        `👤 ${ctx.fmt.bold(user.nickname || user.name || ctx.senderName)}`,
        '',
        `⭐ ${ctx.fmt.bold('Niveau')} : ${ctx.fmt.boldNum(info.level)}`,
        `⚡ ${ctx.fmt.bold('XP total')} : ${ctx.fmt.boldNum(info.xp)}`,
        '',
        `${bar}  ${ctx.fmt.boldNum(info.intoLevel)}/${ctx.fmt.boldNum(info.needed)}`,
        `🎯 ${ctx.fmt.bold('Palier suivant')} : ${ctx.fmt.boldNum(thresholdForLevel(info.level + 1))} XP`,
        '',
        '📌 ' + ctx.fmt.bold('Gagne de l’XP : messages, commandes, jeux, quiz, duels.'),
      ])
    );
  },
};
