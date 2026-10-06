'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xteam.js
 * Xteam — quiz INTER-ÉQUIPES (admins du bot uniquement).
 * Groupes (max 4) → membres par groupe → recrutement par réponse au
 * message → 10 questions par rubrique → tableau final → XCoins.
 */

const { TeamQuizSession } = require('../../systems/teamQuiz');

module.exports = {
  name: 'xteam',
  description: 'Quiz inter-équipes (admins du bot)',
  usage: 'Xteam',
  category: 'games',
  aliases: ['xequipes', 'xteams'],
  adminOnly: true,
  cooldownMs: 5000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('👥 XTEAM', '⚠️ ' + ctx.fmt.bold('Le quiz inter-équipes se joue en groupe !')));
    }
    const existing = ctx.sessions.get(ctx.threadID, 'xteam');
    if (existing) {
      return ctx.send(ctx.fmt.frame('👥 XTEAM', '⚠️ ' + ctx.fmt.bold('Un Xteam est déjà en cours.') + '\n🛑 ' + ctx.fmt.bold('Le lanceur peut taper « stop ».')));
    }
    const session = ctx.sessions.add(
      new TeamQuizSession(ctx.bot, {
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
