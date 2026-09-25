'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xid.js
 * Xid — quiz d'identification de personnages manga (API Jikan, sans clé).
 * Tout le groupe joue : une image, on répond directement (prénom OU nom).
 */

const { MangaQuizSession } = require('../../systems/mangaQuiz');

module.exports = {
  name: 'xid',
  description: 'Quiz manga : identifie les personnages (prénom ou nom accepté)',
  usage: 'Xid',
  category: 'games',
  aliases: ['xidentify', 'xmanga'],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('🎌 XID', '⚠️ ' + ctx.fmt.bold('Le quiz manga se joue en groupe — tout le monde participe !')));
    }
    const existing = ctx.sessions.get(ctx.threadID, 'xid');
    if (existing) {
      return ctx.send(
        ctx.fmt.frame('🎌 XID', '⚠️ ' + ctx.fmt.bold('Un quiz manga est déjà en cours dans ce groupe.') + '\n🛑 ' + ctx.fmt.bold('Le lanceur peut taper « stop ».'))
      );
    }
    const session = ctx.sessions.add(
      new MangaQuizSession(ctx.bot, {
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
