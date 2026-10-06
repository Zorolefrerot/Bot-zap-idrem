'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xduel.js
 * Lance un duel 1v1 avec mise (machine d'états dans systems/duel.js).
 */

const { DuelSession } = require('../../systems/duel');

module.exports = {
  name: 'xduel',
  description: 'Duel de quiz 1v1 avec mise en XCoins',
  usage: 'Xduel',
  category: 'games',
  aliases: ['xd'],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('⚔️ XDUEL', '⚠️ ' + ctx.fmt.bold('Le duel se joue dans un groupe.') + '\n👥 ' + ctx.fmt.bold('Invite-moi dans un groupe !')));
    }
    const existing = ctx.sessions.get(ctx.threadID, 'duel');
    if (existing) {
      return ctx.send(
        ctx.fmt.frame('⚔️ XDUEL', '⚠️ ' + ctx.fmt.bold('Un duel est déjà en cours dans ce groupe.') + '\n🛑 ' + ctx.fmt.bold('Tape « cancel » pour l’annuler.'))
      );
    }
    const b1 = ctx.economy.getBalance(ctx.senderID);
    if (b1 <= 0) {
      return ctx.send(
        ctx.fmt.frame('⚔️ XDUEL', `💸 ${ctx.fmt.bold('Solde insuffisant.')} ${ctx.fmt.bold('Fais Xdaily pour recharger !')}`)
      );
    }
    const session = ctx.sessions.add(
      new DuelSession(ctx.bot, {
        threadID: ctx.threadID,
        initiatorID: ctx.senderID,
        send: (payload) => ctx.send(payload),
      })
    );
    ctx.db.bumpStat('duelsStarted');
    await session.start();
  },
};
