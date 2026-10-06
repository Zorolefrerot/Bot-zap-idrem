'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xpile.js
 * Xpile — pile ou face : choisis ton côté, double ou rien.
 *   Xpile pile 100
 */

module.exports = {
  name: 'xpile',
  description: 'Pile ou face — double ou rien (mise min 50)',
  usage: 'Xpile <pile|face> <mise>',
  category: 'games',
  aliases: ['xcoinflip', 'xpf', 'xface'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    const rng = ctx._rng || Math.random;
    const side = String(ctx.args[0] || '').toLowerCase();
    const mise = Number(String(ctx.args[1] || '').replace(/\s/g, ''));

    if (!['pile', 'face'].includes(side) || !Number.isInteger(mise) || mise < 50) {
      return ctx.send(
        ctx.fmt.frame('🪙 XPILE', [
          '📌 ' + ctx.fmt.bold('Format') + ' : ' + ctx.fmt.bold('Xpile <pile|face> <mise>'),
          `💰 ${ctx.fmt.bold('Mise minimum')} : ${ctx.fmt.bold('50 XCoins')} — ${ctx.fmt.bold('gain ×2')}`,
          '📌 ' + ctx.fmt.bold('Exemple') + ' : ' + ctx.fmt.bold('Xpile face 100'),
        ])
      );
    }
    const user = ctx.db.ensureUser(ctx.senderID);
    if (user.xcoins < mise) {
      return ctx.send(ctx.fmt.frame('🪙 XPILE', `💸 ${ctx.fmt.bold('Solde insuffisant')} — tu as ${ctx.fmt.bold(user.xcoins.toLocaleString('fr-FR') + ' XCoins')}.`));
    }

    ctx.economy.spend(ctx.senderID, mise);
    const coin = rng() < 0.5 ? 'pile' : 'face';
    const win = coin === side;
    let solde = ctx.economy.getBalance(ctx.senderID);
    if (win) solde = ctx.economy.addCoins(ctx.senderID, mise * 2);
    ctx.db.bumpStat('gamesPlayed', 1);

    await ctx.send(
      ctx.fmt.frame(win ? '🪙 XPILE — GAGNÉ !' : '🪙 XPILE — PERDU', [
        `🪙 ${ctx.fmt.bold('La pièce tombe sur')} : ${ctx.fmt.bold(coin.toUpperCase())} ${coin === 'pile' ? '🔵' : '🟡'}`,
        `🎯 ${ctx.fmt.bold('Ton choix')} : ${ctx.fmt.bold(side.toUpperCase())}`,
        '',
        win
          ? `🎉 ${ctx.fmt.bold('Double ou rien réussi')} — +${ctx.fmt.bold((mise * 2).toLocaleString('fr-FR'))} XCoins`
          : `💀 ${ctx.fmt.bold('Mise envolée')} — ${ctx.fmt.bold(mise.toLocaleString('fr-FR'))} XCoins`,
        `💳 ${ctx.fmt.bold('Solde')} : ${ctx.fmt.bold(solde.toLocaleString('fr-FR') + ' XCoins')}`,
      ])
    );
  },
};
