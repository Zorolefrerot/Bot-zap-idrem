'use strict';
/*
 * 🧬 MeR~NeL — commands/economy/xdaily.js
 * Récompense quotidienne : 350 XCoins, cooldown 24 h (côté serveur).
 */

const { humanDelay } = require('../../utils/cooldown');

module.exports = {
  name: 'xdaily',
  description: 'Récupère la récompense quotidienne (350 XCoins / 24 h)',
  usage: 'Xdaily',
  category: 'economy',
  aliases: ['xclaim'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    const result = ctx.economy.claimDaily(ctx.senderID);
    const xpRes = ctx.xp.addXp(ctx.senderID, ctx.config.xp.daily);

    if (result.ok) {
      const lines = [
        '🎁 ' + ctx.fmt.bold('Récompense récupérée :'),
        `💰 +${ctx.fmt.boldNum(result.reward)} ${ctx.fmt.bold('XCoins')}`,
        '',
        '⚡ ' + ctx.fmt.bold('Reviens dans 24 heures.'),
        `💰 ${ctx.fmt.bold('Solde')} : ${ctx.fmt.boldNum(result.balance)}`,
      ];
      if (xpRes.leveledUp) lines.push('', `🎉 ${ctx.fmt.bold('NIVEAU')} ${ctx.fmt.boldNum(xpRes.level)} ${ctx.fmt.bold('atteint')} !`);
      await ctx.send(ctx.fmt.frame('💰 𝗫𝗗𝗔𝗜𝗟𝗬', lines));
      return;
    }

    await ctx.send(
      ctx.fmt.frame('💰 𝗫𝗗𝗔𝗜𝗟𝗬', [
        '⏳ ' + ctx.fmt.bold('Déjà récupéré aujourd’hui.'),
        `⏱️ ${ctx.fmt.bold('Prochain claim')} : ${ctx.fmt.bold(humanDelay(result.nextInMs))}`,
        '',
        ctx.fmt.pick([
          '🤖 ' + ctx.fmt.bold('La patience fait partie de l’entraînement.'),
          '🛰️ ' + ctx.fmt.bold('Le système ne plie pas. Même pour toi.'),
          '☕ ' + ctx.fmt.bold('Reviens plus tard, le crédit reste bloqué.'),
        ]),
      ])
    );
  },
};
