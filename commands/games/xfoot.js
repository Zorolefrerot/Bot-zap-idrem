'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xfoot.js
 * Xfoot — quiz d'identification de JOUEURS DE FOOTBALL (Wikidata, sans clé).
 * Tout le groupe joue : une photo (ou un indice), on répond directement
 * (prénom OU nom OU nom complet). Filtre club/sélection possible.
 */

const { FootQuizSession } = require('../../systems/footQuiz');

module.exports = {
  name: 'xfoot',
  description: 'Quiz football : identifie les joueurs (prénom ou nom accepté)',
  usage: 'Xfoot',
  category: 'games',
  aliases: ['xfootball', 'xjoueur'],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('⚽ XFOOT', '⚠️ ' + ctx.fmt.bold('Le quiz foot se joue en groupe — tout le monde participe !')));
    }
    const existing = ctx.sessions.get(ctx.threadID, 'xfoot');
    if (existing) {
      return ctx.send(
        ctx.fmt.frame('⚽ XFOOT', '⚠️ ' + ctx.fmt.bold('Un quiz foot est déjà en cours dans ce groupe.') + '\n🛑 ' + ctx.fmt.bold('Le lanceur peut taper « stop ».'))
      );
    }
    const session = ctx.sessions.add(
      new FootQuizSession(ctx.bot, {
        threadID: ctx.threadID,
        ownerID: ctx.senderID,
        ownerName: ctx.senderName,
        send: (payload) => ctx.send(payload),
      })
    );
    ctx.db.bumpStat('quizzesStarted');
    await session.start();
  },
};
